// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setPlanSettings, type ExpenseView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function addDayBlock(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId = "sight"): string {
  const result = addBlock(plan, library, { baseId, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function addMoney(plan: Y.Doc, library: Y.Doc, title: string, cents: number | null, blockIds: string[]): void {
  const result = addExpense(plan, library, { title, amountCents: cents, blockIds });
  if (!result.ok) throw new Error("建钱失败");
}

async function moneyCellText(day: string, title: string): Promise<string> {
  return (await blockRow(day, title)).querySelector("[data-money-cell]")?.textContent ?? "";
}

async function openMoney(user: User, day: string, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow(day, title)).getByRole("button", { name: "钱" }));
  return screen.getByRole("group", { name: `${title} 的钱` });
}

/** 编辑区里说明是 note 的那一笔。 */
function expenseRow(editor: HTMLElement, note: string): HTMLElement {
  const row = [...editor.querySelectorAll<HTMLElement>("[data-expense-id]")].find(
    (item) => item.querySelector<HTMLInputElement>("input[aria-label='说明']")?.value === note,
  );
  if (!row) throw new Error(`没有说明是「${note}」的钱`);
  return row;
}

function expensesOf(other: Awaited<ReturnType<typeof openOtherTab>>): ExpenseView[] {
  return [...other.plan().expenses.values()];
}

describe("在块里填钱", () => {
  it("填第一笔：类型跟块、按总价", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.1", "西湖");
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "300{Enter}");

    await waitFor(async () => expect(await moneyCellText("10.1", "西湖")).toBe("¥300"));
    await waitFor(() => expect(expensesOf(other)).toHaveLength(1));
    const [expense] = expensesOf(other);
    expect(expense).toMatchObject({ amount_cents: 30000, basis: "total" });
    expect(expense?.kind.id).toBe("sight");
  });

  it("空行不填不建：点「收起」", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.1", "西湖");
    await user.click(within(editor).getByRole("button", { name: "收起" }));

    expect(screen.queryByRole("group", { name: "西湖 的钱" })).toBeNull();
    expect(await moneyCellText("10.1", "西湖")).toBe("填钱");
    expect(expensesOf(other)).toHaveLength(0);
  });

  it("点「收起」、按 Esc、再点一次钱格都能收起，焦点回到钱格", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
    });
    const cell = within(await blockRow("10.1", "西湖")).getByRole("button", { name: "钱" });

    await user.click(within(await openMoney(user, "10.1", "西湖")).getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("group", { name: "西湖 的钱" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell));

    // 一笔钱都没有时，打开后空行的金额框就有焦点，在里面按 Esc
    await openMoney(user, "10.1", "西湖");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "西湖 的钱" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell));

    await openMoney(user, "10.1", "西湖");
    await user.click(cell);
    expect(screen.queryByRole("group", { name: "西湖 的钱" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell));
  });

  it("空行填了没按回车：点「收起」就建上，按 Esc 就不要了", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
      addDayBlock(plan, library, oct1!, "灵隐寺");
    });
    const other = await openOtherTab(planId);

    const lake = await openMoney(user, "10.1", "西湖");
    await user.type(within(lake).getByRole("textbox", { name: "新一笔的金额" }), "300");
    await user.click(within(lake).getByRole("button", { name: "收起" }));
    await waitFor(async () => expect(await moneyCellText("10.1", "西湖")).toBe("¥300"));

    const temple = await openMoney(user, "10.1", "灵隐寺");
    await user.type(within(temple).getByRole("textbox", { name: "新一笔的金额" }), "50");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("group", { name: "灵隐寺 的钱" })).toBeNull();
    expect(await moneyCellText("10.1", "灵隐寺")).toBe("填钱");
    await waitFor(() => expect(expensesOf(other).map((expense) => expense.amount_cents)).toEqual([30000]));
  });

  it("改金额和人均", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      setPlanSettings(plan, { traveler_count: 3 });
      addMoney(plan, library, "晚饭", 24000, [addDayBlock(plan, library, oct1!, "晚饭", "food")]);
    });

    const editor = await openMoney(user, "10.1", "晚饭");
    const amount = within(expenseRow(editor, "晚饭")).getByRole("textbox", { name: "金额" });
    await user.clear(amount);
    await user.type(amount, "80{Enter}");
    await waitFor(async () => expect(await moneyCellText("10.1", "晚饭")).toBe("¥80"));

    await user.selectOptions(within(expenseRow(editor, "晚饭")).getByRole("combobox", { name: "算法" }), "per_person");
    await waitFor(async () => expect(await moneyCellText("10.1", "晚饭")).toBe("¥240"));
  });

  it("删一笔", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lunch = addDayBlock(plan, library, oct1!, "午饭", "food");
      addMoney(plan, library, "面", 12000, [lunch]);
      addMoney(plan, library, "奶茶", 3850, [lunch]);
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.1", "午饭");
    await user.click(within(expenseRow(editor, "奶茶")).getByRole("button", { name: "删除这笔" }));

    await waitFor(async () => expect(await moneyCellText("10.1", "午饭")).toBe("¥120"));
    await waitFor(() => expect(expensesOf(other).map((expense) => expense.title)).toEqual(["面"]));
  });

  it("共用的钱从这块拿掉：钱还在", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      const secondNight = addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "民宿两晚", 50000, [firstNight, secondNight]);
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.2", "民宿");
    const shared = expenseRow(editor, "民宿两晚");
    expect(within(shared).getByText("也挂在别的块上")).toBeTruthy();
    await user.click(within(shared).getByRole("button", { name: "从这块拿掉" }));

    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("填钱"));
    expect(await moneyCellText("10.1", "民宿")).toBe("¥500");
    await waitFor(() => expect(expensesOf(other)[0]?.block_ids).toHaveLength(1));
  });

  it("金额填错：说明原因，不建", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.1", "西湖");
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "12.345{Enter}");

    expect(within(editor).getByText("要填不小于 0 的数，最多两位小数")).toBeTruthy();
    expect(expensesOf(other)).toHaveLength(0);
  });
});

describe("不属于任何一天的钱", () => {
  it("点「收起」收起，焦点回到「不属于任何一天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const overview = await screen.findByRole("region", { name: "钱的总览" });
    const toggle = within(overview).getByRole("button", { name: "不属于任何一天：¥0" });

    await user.click(toggle);
    const editor = screen.getByRole("group", { name: "不属于任何一天的钱" });
    await user.click(within(editor).getByRole("button", { name: "收起" }));

    expect(screen.queryByRole("group", { name: "不属于任何一天的钱" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});
