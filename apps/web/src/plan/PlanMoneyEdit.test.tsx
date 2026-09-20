// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setPlanSettings, type ExpenseView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherTab, openStoredPlan, overviewCard } from "./test-helpers";

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
  if (!result.ok) throw new Error("建开销失败");
}

async function moneyCellText(day: string, title: string): Promise<string> {
  return (await blockRow(day, title)).querySelector("[data-money-cell]")?.textContent ?? "";
}

async function openMoney(user: User, day: string, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow(day, title)).getByRole("button", { name: "开销" }));
  return screen.getByRole("group", { name: `${title} 的开销` });
}

/** 编辑区里说明是 note 的那一笔。 */
function expenseRow(editor: HTMLElement, note: string): HTMLElement {
  const row = [...editor.querySelectorAll<HTMLElement>("[data-expense-id]")].find(
    (item) => item.querySelector<HTMLInputElement>("input[aria-label='说明']")?.value === note,
  );
  if (!row) throw new Error(`没有说明是「${note}」的开销`);
  return row;
}

function expensesOf(other: Awaited<ReturnType<typeof openOtherTab>>): ExpenseView[] {
  return [...other.plan().expenses.values()];
}

describe("在块里填开销", () => {
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

    expect(screen.queryByRole("group", { name: "西湖 的开销" })).toBeNull();
    expect(await moneyCellText("10.1", "西湖")).toBe("填开销");
    expect(expensesOf(other)).toHaveLength(0);
  });

  it("点「收起」、按 Esc、再点一次开销格都能收起，焦点回到开销格", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
    });
    const cell = within(await blockRow("10.1", "西湖")).getByRole("button", { name: "开销" });

    await user.click(within(await openMoney(user, "10.1", "西湖")).getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("group", { name: "西湖 的开销" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell));

    // 一笔开销都没有时，打开后空行的金额框就有焦点，在里面按 Esc
    await openMoney(user, "10.1", "西湖");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "西湖 的开销" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(cell));

    await openMoney(user, "10.1", "西湖");
    await user.click(cell);
    expect(screen.queryByRole("group", { name: "西湖 的开销" })).toBeNull();
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

    expect(screen.queryByRole("group", { name: "灵隐寺 的开销" })).toBeNull();
    expect(await moneyCellText("10.1", "灵隐寺")).toBe("填开销");
    await waitFor(() => expect(expensesOf(other).map((expense) => expense.amount_cents)).toEqual([30000]));
  });

  it("说明空着：说明框写淡色的「说明」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addMoney(plan, library, "", 6000, [addDayBlock(plan, library, oct1!, "西湖")]);
    });

    const editor = await openMoney(user, "10.1", "西湖");
    const expense = editor.querySelector<HTMLElement>("[data-expense-id]")!;

    expect(within(expense).getByRole("textbox", { name: "说明" }).getAttribute("placeholder")).toBe("说明");
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

    await user.selectOptions(within(expenseRow(editor, "晚饭")).getByRole("combobox", { name: "按总价还是人均" }), "per_person");
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

  it("共用的开销从这件事拿掉：开销还在", async () => {
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
    expect(within(shared).getByText("也挂在别的事上")).toBeTruthy();
    await user.click(within(shared).getByRole("button", { name: "从这件事拿掉" }));

    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("填开销"));
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

describe("把已有的一笔挂到这件事上", () => {
  function pickOf(editor: HTMLElement): HTMLSelectElement {
    return within(editor).getByRole("combobox", { name: "挂上已有的一笔" }) as HTMLSelectElement;
  }

  /** 下拉里除了第一项「挂上已有的一笔…」以外的选项 */
  function choiceLabels(select: HTMLSelectElement): string[] {
    return [...select.options].slice(1).map((option) => option.textContent ?? "");
  }

  it("两晚共用一笔房费：选了就挂上，第二晚写共用，下拉回到第一项、焦点还在", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "民宿两晚", 80000, [firstNight]);
      addMoney(plan, library, "签证", 60000, []);
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.2", "民宿");
    const pick = pickOf(editor);
    expect(pick.options[0]?.textContent).toBe("挂上已有的一笔…");
    await user.selectOptions(pick, "住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿");

    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("共用"));
    expect(await moneyCellText("10.1", "民宿")).toBe("¥800");
    expect(within(expenseRow(editor, "民宿两晚")).getByText("也挂在别的事上")).toBeTruthy();
    expect(pickOf(editor).value).toBe("");
    expect(document.activeElement).toBe(pickOf(editor));
    expect(choiceLabels(pickOf(editor))).toEqual(["其他 ¥600 签证 · 不属于任何一天"]);
    await waitFor(() =>
      expect(expensesOf(other).find((expense) => expense.title === "民宿两晚")?.block_ids).toHaveLength(2),
    );
  });

  it("选项的先后和写法：按行程先后，不属于任何一天的在最后；这件事已经挂着的不列", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const lake = addDayBlock(plan, library, oct1!, "西湖");
      const dinner = addDayBlock(plan, library, oct1!, "晚饭", "food");
      const lodging = addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "门票", 30000, [lake]);
      const perPerson = addExpense(plan, library, { title: "", amountCents: 8000, basis: "per_person", blockIds: [dinner] });
      if (!perPerson.ok) throw new Error("建开销失败");
      addMoney(plan, library, "民宿两晚", 80000, [lodging]);
      addMoney(plan, library, "签证", 60000, []);
      addMoney(plan, library, "保险", null, []);
    });

    const editor = await openMoney(user, "10.2", "民宿");
    expect(choiceLabels(pickOf(editor))).toEqual([
      "游玩 ¥300 门票 · 挂在 10.1 周四 西湖",
      "餐饮 人均 ¥80 · 挂在 10.1 周四 晚饭",
      "其他 ¥600 签证 · 不属于任何一天",
      "其他 没填 保险 · 不属于任何一天",
    ]);
  });

  it("挂完最后一笔：下拉不见了，焦点落到「收起」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "民宿两晚", 80000, [firstNight]);
    });

    const editor = await openMoney(user, "10.2", "民宿");
    await user.selectOptions(pickOf(editor), "住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿");

    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("共用"));
    expect(within(editor).queryByRole("combobox", { name: "挂上已有的一笔" })).toBeNull();
    expect(document.activeElement).toBe(within(editor).getByRole("button", { name: "收起" }));
  });

  it("没有可挂的开销：不出这个下拉", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = addDayBlock(plan, library, oct1!, "西湖");
      addMoney(plan, library, "门票", 30000, [lake]);
    });

    const editor = await openMoney(user, "10.1", "西湖");
    expect(within(editor).queryByRole("combobox", { name: "挂上已有的一笔" })).toBeNull();
  });

  it("挂上不属于任何一天的开销：开销格有了，不属于任何一天变成 0", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addDayBlock(plan, library, oct1!, "西湖");
      addMoney(plan, library, "签证", 60000, []);
    });

    const editor = await openMoney(user, "10.1", "西湖");
    await user.selectOptions(pickOf(editor), "其他 ¥600 签证 · 不属于任何一天");

    await waitFor(async () => expect(await moneyCellText("10.1", "西湖")).toBe("¥600"));
    expect(within(await overviewCard()).getByRole("button", { name: "不属于任何一天：¥0" })).toBeTruthy();
  });

  it("筛选开着时也列出被筛掉的开销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      addDayBlock(plan, library, oct1!, "西湖");
      const lodging = addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "民宿两晚", 80000, [lodging]);
    });

    await blockRow("10.1", "西湖");
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));
    const editor = await openMoney(user, "10.1", "西湖");
    expect(choiceLabels(pickOf(editor))).toEqual(["住宿 ¥800 民宿两晚 · 挂在 10.2 周五 民宿"]);
  });

  it("撤销和重做：撤销回到挂之前，重做又挂上", async () => {
    const user = userEvent.setup();
    let firstNight = "";
    const planId = await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      firstNight = addDayBlock(plan, library, oct1!, "民宿", "lodging");
      addDayBlock(plan, library, oct2!, "民宿", "lodging");
      addMoney(plan, library, "民宿两晚", 80000, [firstNight]);
    });
    const other = await openOtherTab(planId);

    const editor = await openMoney(user, "10.2", "民宿");
    await user.selectOptions(pickOf(editor), "住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿");
    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("共用"));

    await user.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("填开销"));
    await waitFor(() => expect(expensesOf(other)[0]?.block_ids).toEqual([firstNight]));

    await user.click(screen.getByRole("button", { name: "重做" }));
    await waitFor(async () => expect(await moneyCellText("10.2", "民宿")).toBe("共用"));
    await waitFor(() => expect(expensesOf(other)[0]?.block_ids).toHaveLength(2));
  });
});

describe("不属于任何一天的开销", () => {
  it("点「收起」收起，焦点回到「不属于任何一天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const overview = await overviewCard();
    const toggle = within(overview).getByRole("button", { name: "不属于任何一天：¥0" });

    await user.click(toggle);
    const editor = screen.getByRole("group", { name: "不属于任何一天的开销" });
    await user.click(within(editor).getByRole("button", { name: "收起" }));

    expect(screen.queryByRole("group", { name: "不属于任何一天的开销" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });
});
