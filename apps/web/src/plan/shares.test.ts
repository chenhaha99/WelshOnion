import {
  addBlock,
  addExpense,
  addKind,
  deleteKind,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setBlockMark,
  setDays,
  updateKind,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  moneyNoteLabel,
  moneyRowLabel,
  moneyShares,
  sharePercents,
  timeEmptyLabel,
  timeRowLabel,
  timeShares,
} from "./shares";

interface Built {
  plan: Y.Doc;
  library: Y.Doc;
  oct1: string;
}

/** 在内存里搭一个 10.1 一天的计划，按需放块、开销，返回读出来的视图。 */
function build(setup: (built: Built) => void): { plan: PlanView; library: LibraryView } {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: 1, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  setup({ plan, library, oct1: days.value.baseIds[0]! });
  const libraryView = readLibrary(library);
  return { plan: readPlan(plan, libraryView), library: libraryView };
}

function timed(built: Built, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(built.plan, built.library, { baseId: built.oct1, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function undated(built: Built, title: string, kindId: string): string {
  const result = addBlock(built.plan, built.library, { baseId: built.oct1, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(built: Built, kindId: string, cents: number | null): void {
  const result = addExpense(built.plan, built.library, { title: kindId, amountCents: cents, kindId });
  if (!result.ok) throw new Error("建开销失败");
}

function customKind(built: Built, name: string): string {
  const result = addKind(built.library, { name, color: "#6b8fb0" });
  if (!result.ok) throw new Error("建类型失败");
  return result.value.kindId;
}

describe("取整百分比（最大余数法）", () => {
  it("加起来正好 100", () => {
    expect(sharePercents([1200, 180, 60])).toEqual([83, 13, 4]);
    expect(sharePercents([1200, 600])).toEqual([67, 33]);
    expect(sharePercents([1, 1, 1])).toEqual([34, 33, 33]);
  });
});

describe("开销的占比", () => {
  it("按类型分，从多到少", () => {
    const { plan, library } = build((built) => {
      money(built, "transit", 20000);
      money(built, "lodging", 120000);
      money(built, "food", 60000);
    });
    const shares = moneyShares(plan, library);
    expect(moneyNoteLabel(shares)).toBeNull();
    expect(shares.rows.map(moneyRowLabel)).toEqual(["住宿 ¥1,200 · 60%", "餐饮 ¥600 · 30%", "交通 ¥200 · 10%"]);
  });

  it("只算已填的；全没填的类不进比例、排最后", () => {
    const { plan, library } = build((built) => {
      money(built, "lodging", 120000);
      money(built, "food", 60000);
      money(built, "food", null);
      money(built, "shopping", null);
    });
    const shares = moneyShares(plan, library);
    expect(moneyNoteLabel(shares)).toBe("只算已填的 2 笔，还有 2 笔没填");
    expect(shares.rows.map(moneyRowLabel)).toEqual([
      "住宿 ¥1,200 · 67%",
      "餐饮 ¥600 · 33% · 还有 1 笔没填",
      "购物 · 还有 1 笔没填",
    ]);
  });

  it("一笔填了金额的都没有", () => {
    const { plan, library } = build((built) => money(built, "food", null));
    expect(moneyNoteLabel(moneyShares(plan, library))).toBe("还没有填了金额的开销");
  });

  it("填了的加起来是 0：没有能进比例的", () => {
    const { plan, library } = build((built) => money(built, "sight", 0));
    const shares = moneyShares(plan, library);
    expect(shares.rows).toEqual([]);
    expect(moneyNoteLabel(shares)).toBe("填了金额的 1 笔加起来是 ¥0");
  });

  it("被删掉的类型合成一类「已删除的类型」", () => {
    const { plan, library } = build((built) => {
      const ticket = customKind(built, "门票");
      const souvenir = customKind(built, "纪念品");
      money(built, "food", 30000);
      money(built, ticket, 10000);
      money(built, souvenir, 15000);
      deleteKind(built.library, ticket);
      deleteKind(built.library, souvenir);
    });
    expect(moneyShares(plan, library).rows.map(moneyRowLabel)).toEqual(["餐饮 ¥300 · 55%", "已删除的类型 ¥250 · 45%"]);
  });
});

describe("时间的占比", () => {
  function hangzhouDay(built: Built): void {
    timed(built, "在杭州", "stay", 0, 1440);
    timed(built, "西湖", "sight", 540, 180);
    timed(built, "午饭", "food", 720, 60);
  }

  it("默认不算最底层的类型（停留）", () => {
    const { plan, library } = build(hangzhouDay);
    const shares = timeShares(plan, library, false);
    expect(shares.rows.map(timeRowLabel)).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
    expect(shares.baseLayerNames).toEqual(["停留"]);
    expect(shares.baseLayerMinutes).toBe(1200);
  });

  it("算上最底层的类型：停留只算没被盖住的分钟", () => {
    const { plan, library } = build(hangzhouDay);
    expect(timeShares(plan, library, true).rows.map(timeRowLabel)).toEqual([
      "停留 20 小时 · 83%",
      "游玩 3 小时 · 13%",
      "餐饮 1 小时 · 4%",
    ]);
  });

  it("没排时间的块不进", () => {
    const { plan, library } = build((built) => {
      timed(built, "西湖", "sight", 540, 90);
      undated(built, "灵隐寺", "sight");
    });
    expect(timeShares(plan, library, false).rows.map(timeRowLabel)).toEqual(["游玩 1.5 小时 · 100%"]);
  });

  it("停留没排时间：最底层的类型一分钟都没占到", () => {
    const { plan, library } = build((built) => {
      undated(built, "在杭州", "stay");
      timed(built, "西湖", "sight", 540, 180);
    });
    expect(timeShares(plan, library, false).baseLayerMinutes).toBe(0);
  });

  it("一件排了时间的事都没有", () => {
    const { plan, library } = build((built) => {
      undated(built, "灵隐寺", "sight");
    });
    const shares = timeShares(plan, library, false);
    expect(shares.rows).toEqual([]);
    expect(timeEmptyLabel(shares)).toBe("还没有排了时间的事");
  });

  it("排了时间的只有没算进来的停留", () => {
    const { plan, library } = build((built) => {
      timed(built, "在杭州", "stay", 0, 1440);
    });
    const shares = timeShares(plan, library, false);
    expect(shares.rows).toEqual([]);
    expect(timeEmptyLabel(shares)).toBe("除了停留，还没有排了时间的事");
    expect(timeShares(plan, library, true).rows.map(timeRowLabel)).toEqual(["停留 24 小时 · 100%"]);
  });

  it("没有层为 0 的类型：停留照常算", () => {
    const { plan, library } = build((built) => {
      updateKind(built.library, "stay", { layer: 1 });
      timed(built, "在杭州", "stay", 0, 1440);
      timed(built, "西湖", "sight", 540, 180);
    });
    const shares = timeShares(plan, library, false);
    expect(shares.baseLayerNames).toEqual([]);
    expect(shares.baseLayerMinutes).toBe(0);
    expect(shares.rows.map(timeRowLabel)).toEqual(["停留 21 小时 · 88%", "游玩 3 小时 · 12%"]);
  });

  it("被删掉的类型合成一类；一样多时按类型顺序，已删除的类型排后面", () => {
    const { plan, library } = build((built) => {
      const queue = customKind(built, "排队");
      const rest = customKind(built, "歇脚");
      timed(built, "排队进场", queue, 540, 60);
      timed(built, "茶馆", rest, 660, 30);
      timed(built, "西湖", "sight", 780, 90);
      deleteKind(built.library, queue);
      deleteKind(built.library, rest);
    });
    expect(timeShares(plan, library, false).rows.map(timeRowLabel)).toEqual([
      "游玩 1.5 小时 · 50%",
      "已删除的类型 1.5 小时 · 50%",
    ]);
  });
});

describe("带筛选", () => {
  const onlyUnchecked: StatsFilter = { marks: ["pending", "decided"] };

  function linkedMoney(built: Built, blockId: string, kindId: string, cents: number): void {
    const result = addExpense(built.plan, built.library, { title: kindId, amountCents: cents, kindId, blockIds: [blockId] });
    if (!result.ok) throw new Error("建开销失败");
  }

  /** 西湖（游玩，完成了）挂 300 元；晚饭（餐饮）挂 120 元；另有不挂块的 600 元。 */
  function lakeAndDinner(built: Built): void {
    const lake = timed(built, "西湖", "sight", 540, 180);
    const dinner = timed(built, "晚饭", "food", 1080, 60);
    setBlockMark(built.plan, [lake], "done");
    linkedMoney(built, lake, "sight", 30000);
    linkedMoney(built, dinner, "food", 12000);
    money(built, "other", 60000);
  }

  it("开销：挂在被筛掉的块上的不算，不挂块的照算", () => {
    const { plan, library } = build(lakeAndDinner);
    expect(moneyShares(plan, library, onlyUnchecked).rows.map(moneyRowLabel)).toEqual([
      "其他 ¥600 · 83%",
      "餐饮 ¥120 · 17%",
    ]);
  });

  it("时间：被筛掉的块不占时间", () => {
    const { plan, library } = build(lakeAndDinner);
    expect(timeShares(plan, library, false, onlyUnchecked).rows.map(timeRowLabel)).toEqual(["餐饮 1 小时 · 100%"]);
  });
});
