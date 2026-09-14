import {
  addBlock,
  addExpense,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setBlockStatus,
  setDays,
  setPlanSettings,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { moneyCellEmpty, moneyCellLabel, moneyCellNote, moneyCells, moneyOnHiddenBlocks } from "./money-cells";

interface Builder {
  plan: Y.Doc;
  library: Y.Doc;
  days: string[];
  block: (dayIndex: number, title: string, kindId?: string) => string;
  /** 不给 kindId：挂了块跟第一个块的类型 */
  expense: (input: {
    title: string;
    cents: number | null;
    blockIds: string[];
    perPerson?: boolean;
    kindId?: string;
  }) => void;
}

/** 在内存里搭一个 10.1 起两天的计划，按需放块和钱，返回读出来的计划视图。 */
function planWith(setup: (build: Builder) => void, travelers = 1): PlanView {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const result = setDays(plan, { startDate: "2026-10-01", count: 2, tz: "Asia/Shanghai" });
  if (!result.ok) throw new Error("建天失败");
  if (travelers !== 1) setPlanSettings(plan, { traveler_count: travelers });

  setup({
    plan,
    library,
    days: result.value.baseIds,
    block: (dayIndex, title, kindId = "sight") => {
      const added = addBlock(plan, library, { baseId: result.value.baseIds[dayIndex]!, kindId, title, slot: "day" });
      if (!added.ok) throw new Error("建块失败");
      return added.value.blockId;
    },
    expense: ({ title, cents, blockIds, perPerson, kindId }) => {
      const added = addExpense(plan, library, {
        title,
        amountCents: cents,
        blockIds,
        basis: perPerson ? "per_person" : "total",
        ...(kindId === undefined ? {} : { kindId }),
      });
      if (!added.ok) throw new Error("建钱失败");
    },
  });
  return readPlan(plan, readLibrary(library));
}

function labelOf(view: PlanView, title: string, filter?: StatsFilter): string {
  const block = [...view.blocks.values()].find((item) => item.title === title)!;
  return moneyCellLabel(moneyCells(view, filter).get(block.id));
}

function cellOf(view: PlanView, title: string, filter?: StatsFilter) {
  const block = [...view.blocks.values()].find((item) => item.title === title)!;
  return moneyCells(view, filter).get(block.id);
}

describe("钱格怎么显示", () => {
  it("一笔写金额，多笔写合计和笔数", () => {
    const view = planWith(({ block, expense }) => {
      expense({ title: "门票", cents: 30000, blockIds: [block(0, "西湖")] });
      const lunch = block(0, "午饭", "food");
      expense({ title: "面", cents: 12000, blockIds: [lunch] });
      expense({ title: "奶茶", cents: 3850, blockIds: [lunch] });
    });
    expect(labelOf(view, "西湖")).toBe("¥300");
    expect(labelOf(view, "午饭")).toBe("¥158.50 · 2 笔");
  });

  it("没填金额的不进合计，但算笔数", () => {
    const view = planWith(({ block, expense }) => {
      const lunch = block(0, "午饭", "food");
      expense({ title: "面", cents: 12000, blockIds: [lunch] });
      expense({ title: "饮料", cents: null, blockIds: [lunch] });
    });
    expect(labelOf(view, "午饭")).toBe("¥120 · 2 笔");
  });

  it("人均按人数乘", () => {
    const view = planWith(({ block, expense }) => {
      expense({ title: "晚饭", cents: 8000, blockIds: [block(0, "晚饭", "food")], perPerson: true });
    }, 3);
    expect(labelOf(view, "晚饭")).toBe("¥240");
  });

  it("没挂钱写「填钱」，只有一笔没填写「未填」", () => {
    const view = planWith(({ block, expense }) => {
      block(0, "灵隐寺");
      expense({ title: "游船", cents: null, blockIds: [block(0, "游船")] });
    });
    expect(labelOf(view, "灵隐寺")).toBe("填钱");
    expect(labelOf(view, "游船")).toBe("未填");
  });

  it("共用的钱只在最早那块显示；自己也有钱时加「含共用」", () => {
    const view = planWith(({ block, expense }) => {
      const firstNight = block(0, "民宿一", "lodging");
      const secondNight = block(1, "民宿二", "lodging");
      expense({ title: "民宿两晚", cents: 50000, blockIds: [secondNight, firstNight] });
      expense({ title: "早餐", cents: 3000, blockIds: [secondNight] });
    });
    expect(labelOf(view, "民宿一")).toBe("¥500");
    expect(labelOf(view, "民宿二")).toBe("¥30 含共用");
  });

  it("只有共用的钱写「共用」", () => {
    const view = planWith(({ block, expense }) => {
      const firstNight = block(0, "民宿一", "lodging");
      const secondNight = block(1, "民宿二", "lodging");
      expense({ title: "民宿两晚", cents: 50000, blockIds: [firstNight, secondNight] });
    });
    expect(labelOf(view, "民宿二")).toBe("共用");
  });
});

describe("带筛选", () => {
  const confirmedOnly: StatsFilter = { statusIds: ["confirmed"] };

  it("共用的钱显示在通过筛选的块里表上最早的那块", () => {
    const view = planWith(({ plan, library, block, expense }) => {
      const firstNight = block(0, "民宿一", "lodging");
      const secondNight = block(1, "民宿二", "lodging");
      setBlockStatus(plan, library, [secondNight], "confirmed");
      expense({ title: "民宿两晚", cents: 50000, blockIds: [firstNight, secondNight] });
    });
    expect(labelOf(view, "民宿一")).toBe("¥500");
    expect(labelOf(view, "民宿二", confirmedOnly)).toBe("¥500");
  });

  it("被筛掉的块不进钱格", () => {
    const view = planWith(({ plan, library, block, expense }) => {
      expense({ title: "门票", cents: 30000, blockIds: [block(0, "西湖")] });
      const lunch = block(0, "午饭", "food");
      setBlockStatus(plan, library, [lunch], "confirmed");
      expense({ title: "面", cents: 12000, blockIds: [lunch] });
    });
    const titles = [...moneyCells(view, confirmedOnly).keys()].map((id) => view.blocks.get(id)?.title);
    expect(titles).toEqual(["午饭"]);
  });
});

describe("按类型筛", () => {
  const lodgingOnly: StatsFilter = { kindIds: ["lodging"] };

  it("钱格只算所选类型；块上还挂着别的类型的钱时另写一行", () => {
    const view = planWith(({ block, expense }) => {
      const inn = block(0, "民宿", "lodging");
      expense({ title: "房费", cents: 48000, blockIds: [inn], kindId: "lodging" });
      expense({ title: "早餐", cents: 3000, blockIds: [inn], kindId: "food" });
    });
    expect(labelOf(view, "民宿", lodgingOnly)).toBe("¥480");
    expect(moneyCellNote(cellOf(view, "民宿", lodgingOnly))).toBe("另有别的类型的钱");
    // 不筛时两笔都算，没有那一行
    expect(labelOf(view, "民宿")).toBe("¥510 · 2 笔");
    expect(moneyCellNote(cellOf(view, "民宿"))).toBeNull();
  });

  it("只挂着别的类型的钱：写「填钱」、另写一行，算空的钱格", () => {
    const view = planWith(({ block, expense }) => {
      expense({ title: "早餐", cents: 3000, blockIds: [block(0, "酒店", "lodging")], kindId: "food" });
    });
    const hotel = cellOf(view, "酒店", lodgingOnly);
    expect(moneyCellLabel(hotel)).toBe("填钱");
    expect(moneyCellNote(hotel)).toBe("另有别的类型的钱");
    expect(moneyCellEmpty(hotel)).toBe(true);
  });

  it("没有钱格是空的；只有共用的钱不算空", () => {
    const view = planWith(({ block, expense }) => {
      const firstNight = block(0, "民宿一", "lodging");
      const secondNight = block(1, "民宿二", "lodging");
      expense({ title: "民宿两晚", cents: 50000, blockIds: [firstNight, secondNight] });
      block(0, "西湖");
    });
    expect(moneyCellEmpty(cellOf(view, "西湖"))).toBe(true);
    expect(moneyCellEmpty(cellOf(view, "民宿二"))).toBe(false);
    expect(moneyCellEmpty(cellOf(view, "民宿一"))).toBe(false);
  });
});

describe("挂在被筛掉的块上的钱", () => {
  it("按类型筛：所选类型的钱挂的块都被筛掉了，算填了的金额；不挂块的不算", () => {
    const view = planWith(({ block, expense }) => {
      const hengdian = block(0, "横店", "sight");
      expense({ title: "住宿费", cents: 30000, blockIds: [hengdian], kindId: "lodging" });
      expense({ title: "押金", cents: null, blockIds: [hengdian], kindId: "lodging" });
      expense({ title: "房费", cents: 48000, blockIds: [block(0, "民宿", "lodging")], kindId: "lodging" });
      expense({ title: "订房服务费", cents: 2000, blockIds: [], kindId: "lodging" });
    });
    expect(moneyOnHiddenBlocks(view, { kindIds: ["lodging"] })).toBe(30000);
  });

  it("不筛、只按状态筛时是 0", () => {
    const view = planWith(({ plan, library, block, expense }) => {
      const lake = block(0, "西湖");
      setBlockStatus(plan, library, [lake], "confirmed");
      expense({ title: "门票", cents: 30000, blockIds: [lake, block(0, "灵隐寺")] });
    });
    expect(moneyOnHiddenBlocks(view)).toBe(0);
    expect(moneyOnHiddenBlocks(view, { statusIds: ["confirmed"] })).toBe(0);
    expect(moneyOnHiddenBlocks(view, { statusIds: ["pending"] })).toBe(0);
  });

  it("状态和类型一起：块的状态通过、类型没通过", () => {
    const view = planWith(({ plan, library, block, expense }) => {
      const hengdian = block(0, "横店", "sight");
      setBlockStatus(plan, library, [hengdian], "confirmed");
      expense({ title: "住宿费", cents: 30000, blockIds: [hengdian], kindId: "lodging" });
    });
    expect(moneyOnHiddenBlocks(view, { statusIds: ["confirmed"], kindIds: ["lodging"] })).toBe(30000);
  });

  it("人均的按人数乘", () => {
    const view = planWith(({ block, expense }) => {
      expense({ title: "住宿费", cents: 10000, blockIds: [block(0, "横店", "sight")], kindId: "lodging", perPerson: true });
    }, 3);
    expect(moneyOnHiddenBlocks(view, { kindIds: ["lodging"] })).toBe(30000);
  });
});
