import {
  addBlock,
  addExpense,
  initLibraryDoc,
  initPlanDoc,
  moneySummary,
  readLibrary,
  readPlan,
  setDays,
  updateBlock,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { dayFactsParts } from "./day-facts";
import { moneyCells } from "./money-cells";

interface Built {
  plan: Y.Doc;
  library: Y.Doc;
  oct1: string;
  oct2: string;
}

/** 在内存里搭 10.1、10.2 两天的计划，按需放块和钱，返回读出来的视图。 */
function build(setup: (built: Built) => void): PlanView {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: 2, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  setup({ plan, library, oct1: days.value.baseIds[0]!, oct2: days.value.baseIds[1]! });
  return readPlan(plan, readLibrary(library));
}

/** 第 index 天（从 0 数）那一行的字，各项用「 · 」连起来；一项都没有是 null。 */
function lineOf(plan: PlanView, index: number): string | null {
  const parts = dayFactsParts(plan, plan.bases[index]!, moneyCells(plan));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function timed(built: Built, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(built.plan, built.library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function undated(built: Built, baseId: string, title: string, kindId: string, duration?: number): string {
  const result = addBlock(built.plan, built.library, {
    baseId,
    kindId,
    title,
    slot: "day",
    ...(duration === undefined ? {} : { duration }),
  });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function travel(built: Built, blockId: string, mode: "drive" | "walk", meters: number): void {
  const result = updateBlock(built.plan, built.library, blockId, { transport_mode: mode, distance_m: meters });
  if (!result.ok) throw new Error("改交通失败");
}

function money(built: Built, cents: number | null, blockIds: string[]): void {
  const result = addExpense(built.plan, built.library, { title: "钱", amountCents: cents, blockIds });
  if (!result.ok) throw new Error("建钱失败");
}

describe("每天写这天怎么样", () => {
  it("各项都有", () => {
    const plan = build((built) => {
      travel(built, timed(built, built.oct1, "去西湖", "transit", 480, 60), "drive", 32000);
      const lake = timed(built, built.oct1, "西湖", "sight", 540, 180);
      const dinner = timed(built, built.oct1, "晚饭", "food", 1080, 60);
      undated(built, built.oct1, "灵隐寺", "sight", 120);
      money(built, 30000, [lake]);
      money(built, null, [dinner]);
    });
    expect(lineOf(plan, 0)).toBe("08:00 起 · 19:00 收工 · 自驾 1 小时 32 公里 · 还有 2 小时没排 · 花 ¥300（还有 1 笔没填）");
  });

  it("一项都没有", () => {
    const plan = build((built) => {
      undated(built, built.oct1, "逛街", "shopping");
    });
    expect(lineOf(plan, 0)).toBeNull();
  });
});

describe("几点起、几点收工", () => {
  it("停留和住宿不算", () => {
    const plan = build((built) => {
      timed(built, built.oct1, "在杭州", "stay", 0, 1440);
      timed(built, built.oct1, "民宿", "lodging", 1320, 600);
      timed(built, built.oct1, "西湖", "sight", 540, 180);
      timed(built, built.oct1, "晚饭", "food", 1080, 60);
    });
    expect(lineOf(plan, 0)).toBe("09:00 起 · 19:00 收工");
  });

  it("收工过了半夜", () => {
    const plan = build((built) => {
      timed(built, built.oct1, "夜游", "sight", 1320, 180);
    });
    expect(lineOf(plan, 0)).toBe("22:00 起 · 10.2 01:00 收工");
  });

  it("正好半夜收工", () => {
    const plan = build((built) => {
      timed(built, built.oct1, "夜游", "sight", 1320, 120);
    });
    expect(lineOf(plan, 0)).toBe("22:00 起 · 24:00 收工");
  });
});

describe("自驾多久多远", () => {
  it("两段自驾加一段步行", () => {
    const plan = build((built) => {
      travel(built, timed(built, built.oct1, "去湖州", "transit", 540, 180), "drive", 132000);
      travel(built, timed(built, built.oct1, "逛古镇", "transit", 780, 60), "walk", 2000);
      travel(built, timed(built, built.oct1, "去乌镇", "transit", 900, 60), "drive", 30500);
    });
    expect(lineOf(plan, 0)).toBe("09:00 起 · 16:00 收工 · 自驾 4 小时 162.5 公里");
  });

  it("只填了距离", () => {
    const plan = build((built) => {
      travel(built, undated(built, built.oct1, "挪车", "transit"), "drive", 800);
    });
    expect(lineOf(plan, 0)).toBe("自驾 800 米");
  });
});

describe("还有多少没排", () => {
  it("几件没排的事，没填时长的不算", () => {
    const plan = build((built) => {
      undated(built, built.oct1, "灵隐寺", "sight", 120);
      undated(built, built.oct1, "茶馆", "food", 45);
      undated(built, built.oct1, "逛街", "shopping", 45);
      undated(built, built.oct1, "看展", "sight");
    });
    expect(lineOf(plan, 0)).toBe("还有 3.5 小时没排");
  });
});

describe("这天花多少", () => {
  it("挂在两天的块上算前一天", () => {
    const plan = build((built) => {
      money(built, 30000, [undated(built, built.oct2, "灵隐寺", "sight"), undated(built, built.oct1, "西湖", "sight")]);
    });
    expect(lineOf(plan, 0)).toBe("花 ¥300");
    expect(lineOf(plan, 1)).toBeNull();
  });

  it("全没填", () => {
    const plan = build((built) => {
      money(built, null, [undated(built, built.oct1, "午饭", "food")]);
    });
    expect(lineOf(plan, 0)).toBe("有 1 笔钱没填");
  });

  it("不属于任何一天的钱", () => {
    const plan = build((built) => {
      money(built, 60000, []);
      undated(built, built.oct1, "西湖", "sight");
    });
    expect(lineOf(plan, 0)).toBeNull();
  });

  it("按天加起来和 core 的每天花多少一致", () => {
    const plan = build((built) => {
      const lake = undated(built, built.oct1, "西湖", "sight");
      const lingyin = timed(built, built.oct2, "灵隐寺", "sight", 600, 120);
      const dinner = timed(built, built.oct2, "晚饭", "food", 1080, 60);
      money(built, 30000, [lingyin, lake]);
      money(built, 4550, [dinner]);
      money(built, null, [dinner]);
      money(built, 60000, []);
    });
    expect(lineOf(plan, 0)).toBe("花 ¥300");
    expect(lineOf(plan, 1)).toBe("10:00 起 · 19:00 收工 · 花 ¥45.50（还有 1 笔没填）");
    expect(Object.fromEntries(moneySummary(plan).byDay)).toEqual({
      [plan.bases[0]!.id]: 30000,
      [plan.bases[1]!.id]: 4550,
    });
  });
});
