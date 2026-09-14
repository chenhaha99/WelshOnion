import {
  addBlock,
  addExpense,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setDays,
  setPlanSettings,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { moneyCellLabel, moneyCells } from "./money-cells";

interface Builder {
  plan: Y.Doc;
  library: Y.Doc;
  days: string[];
  block: (dayIndex: number, title: string, kindId?: string) => string;
  expense: (input: { title: string; cents: number | null; blockIds: string[]; perPerson?: boolean }) => void;
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
    expense: ({ title, cents, blockIds, perPerson }) => {
      const added = addExpense(plan, library, {
        title,
        amountCents: cents,
        blockIds,
        basis: perPerson ? "per_person" : "total",
      });
      if (!added.ok) throw new Error("建钱失败");
    },
  });
  return readPlan(plan, readLibrary(library));
}

function labelOf(view: PlanView, title: string): string {
  const block = [...view.blocks.values()].find((item) => item.title === title)!;
  return moneyCellLabel(moneyCells(view).get(block.id));
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
