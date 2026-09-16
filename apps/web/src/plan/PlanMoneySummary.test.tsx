// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setPlanSettings } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, moneyOverview, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function addDayBlock(plan: Y.Doc, library: Y.Doc, baseId: string, title: string): string {
  const result = addBlock(plan, library, { baseId, kindId: "sight", title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function addMoney(plan: Y.Doc, library: Y.Doc, title: string, cents: number | null, blockIds: string[]): void {
  const result = addExpense(plan, library, { title, amountCents: cents, blockIds });
  if (!result.ok) throw new Error("建开销失败");
}

async function summaryText(): Promise<string> {
  // 开销总览在「总览」这个视图里
  const overview = await moneyOverview();
  return overview.querySelector("[data-money-summary]")?.textContent ?? "";
}

describe("总额、人均和填写进度", () => {
  it("部分填了", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      setPlanSettings(plan, { traveler_count: 3 });
      addMoney(plan, library, "门票", 30000, [addDayBlock(plan, library, oct1!, "西湖")]);
      addMoney(plan, library, "签证", 60000, []);
      addMoney(plan, library, "船票", null, [addDayBlock(plan, library, oct1!, "游船")]);
      addDayBlock(plan, library, oct1!, "灵隐寺");
    });

    expect(await summaryText()).toBe("总额 ¥900 · 人均 ¥300 · 已填 2 / 共 3 笔 · 另有 1 件事还没填开销");
  });
});

describe("不属于任何一天的开销", () => {
  it("加一笔签证费：不挂块、类型其他", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const other = await openOtherTab(planId);

    const overview = await moneyOverview();
    await user.click(within(overview).getByRole("button", { name: "不属于任何一天：¥0" }));
    const editor = screen.getByRole("group", { name: "不属于任何一天的开销" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的说明" }), "签证");
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "600{Enter}");

    expect(await within(overview).findByRole("button", { name: "不属于任何一天：¥600" })).toBeTruthy();
    await waitFor(() => expect([...other.plan().expenses.values()]).toHaveLength(1));
    const [visa] = other.plan().expenses.values();
    expect(visa).toMatchObject({ title: "签证", amount_cents: 60000, block_ids: [] });
    expect(visa?.kind.id).toBe("other");
  });
});
