// @vitest-environment happy-dom
import { cleanup } from "@testing-library/react";
import { addBlock, addExpense, setPlanSettings } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function addDayBlock(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId = "sight"): string {
  const result = addBlock(plan, library, { baseId, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function addMoney(
  plan: Y.Doc,
  library: Y.Doc,
  input: { title: string; cents: number | null; blockIds: string[]; perPerson?: boolean },
): void {
  const result = addExpense(plan, library, {
    title: input.title,
    amountCents: input.cents,
    blockIds: input.blockIds,
    basis: input.perPerson ? "per_person" : "total",
  });
  if (!result.ok) throw new Error("建钱失败");
}

async function moneyCellText(day: string, title: string): Promise<string> {
  return (await blockRow(day, title)).querySelector("[data-money-cell]")?.textContent ?? "";
}

describe("钱格怎么显示", () => {
  it("一笔和多笔", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addMoney(plan, library, { title: "门票", cents: 30000, blockIds: [addDayBlock(plan, library, oct1!, "西湖")] });
      const lunch = addDayBlock(plan, library, oct1!, "午饭", "food");
      addMoney(plan, library, { title: "面", cents: 12000, blockIds: [lunch] });
      addMoney(plan, library, { title: "奶茶", cents: 3850, blockIds: [lunch] });
    });

    expect(await moneyCellText("10.1", "西湖")).toBe("¥300");
    expect(await moneyCellText("10.1", "午饭")).toBe("¥158.50 · 2 笔");
  });

  it("人均按人数乘", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      setPlanSettings(plan, { traveler_count: 3 });
      const dinner = addDayBlock(plan, library, oct1!, "晚饭", "food");
      addMoney(plan, library, { title: "晚饭", cents: 8000, blockIds: [dinner], perPerson: true });
    });

    expect(await moneyCellText("10.1", "晚饭")).toBe("¥240");
  });

  it("没挂钱和没填金额", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "灵隐寺");
      addMoney(plan, library, { title: "船票", cents: null, blockIds: [addDayBlock(plan, library, oct1!, "游船")] });
    });

    expect(await moneyCellText("10.1", "灵隐寺")).toBe("填钱");
    expect(await moneyCellText("10.1", "游船")).toBe("未填");
  });

  it("共用和含共用", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      const secondNight = addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, { title: "民宿两晚", cents: 50000, blockIds: [firstNight, secondNight] });
      addMoney(plan, library, { title: "早餐", cents: 3000, blockIds: [secondNight] });
    });

    expect(await moneyCellText("10.1", "民宿")).toBe("¥500");
    expect(await moneyCellText("10.2", "民宿")).toBe("¥30 含共用");
  });

  it("只有共用", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      const secondNight = addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, { title: "民宿两晚", cents: 50000, blockIds: [firstNight, secondNight] });
    });

    expect(await moneyCellText("10.2", "民宿")).toBe("共用");
  });
});
