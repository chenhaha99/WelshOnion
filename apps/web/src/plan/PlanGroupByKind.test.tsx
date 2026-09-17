// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockChecked } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, moneyOverview, openOtherTab, openStoredPlan, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function dayBlock(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string): string {
  const result = addBlock(plan, library, { baseId, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, title: string, cents: number | null, kindId: string, blockIds: string[]): void {
  const result = addExpense(plan, library, { title, amountCents: cents, kindId, blockIds });
  if (!result.ok) throw new Error("建开销失败");
}

/**
 * 10.1：「民宿」（住宿）挂 480 房费；「横店」（游玩）挂 300 住宿费（住宿）；「早茶」（餐饮）挂 30 早茶开销。
 * 10.2：「午饭」（餐饮）没挂开销；「西湖」（游玩）挂 60 门票。
 * 不挂块：20 订房服务费（住宿，最先建的）、600 签证（其他）。返回每件事的 id，按标题。
 */
function trip(plan: Y.Doc, library: Y.Doc): Record<string, string> {
  const [oct1, oct2] = daysFromOct1(plan, 2);
  money(plan, library, "订房服务费", 2000, "lodging", []);
  const inn = dayBlock(plan, library, oct1!, "民宿", "lodging");
  const hengdian = dayBlock(plan, library, oct1!, "横店", "sight");
  const tea = dayBlock(plan, library, oct1!, "早茶", "food");
  const lunch = dayBlock(plan, library, oct2!, "午饭", "food");
  const lake = dayBlock(plan, library, oct2!, "西湖", "sight");
  money(plan, library, "房费", 48000, "lodging", [inn]);
  money(plan, library, "住宿费", 30000, "lodging", [hengdian]);
  money(plan, library, "早茶钱", 3000, "food", [tea]);
  money(plan, library, "门票", 6000, "sight", [lake]);
  money(plan, library, "签证", 60000, "other", []);
  return { 民宿: inn, 横店: hengdian, 早茶: tea, 午饭: lunch, 西湖: lake };
}

async function switchTo(user: User, name: "按天" | "按类型"): Promise<void> {
  await showView("列表");
  await user.click(within(await screen.findByRole("group", { name: "分组" })).getByRole("button", { name }));
}

function groups(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "类型分组" })).getAllByRole("listitem");
}

function groupOf(kind: string): HTMLElement {
  const group = groups().find((item) => item.getAttribute("aria-label") === kind);
  if (!group) throw new Error(`没有「${kind}」组`);
  return group;
}

/** 组里的行，按显示顺序：开销写说明，没挂开销的块写「（空）块的名字」。 */
function rowsOf(group: HTMLElement): string[] {
  return [...group.querySelectorAll<HTMLElement>("[data-expense-id], [data-empty-block-id]")].map((row) =>
    row.hasAttribute("data-expense-id")
      ? row.querySelector<HTMLInputElement>("input[aria-label='说明']")!.value
      : `（空）${row.querySelector("[data-block-label]")!.textContent}`,
  );
}

function expenseRowOf(group: HTMLElement, note: string): HTMLElement {
  const row = [...group.querySelectorAll<HTMLElement>("[data-expense-id]")].find(
    (item) => item.querySelector<HTMLInputElement>("input[aria-label='说明']")!.value === note,
  );
  if (!row) throw new Error(`组里没有「${note}」`);
  return row;
}

function summaryOf(kind: string): string | null {
  return groupOf(kind).querySelector("[data-group-summary]")?.textContent ?? null;
}

describe("按天、按类型切换", () => {
  it("默认按天；点「按类型」换成类型分组，开销的总览照旧；点「按天」换回来", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);

    await showView("列表");
    const toggle = await screen.findByRole("group", { name: "分组" });
    expect(within(toggle).getByRole("button", { name: "按天" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("list", { name: "日期列表" })).toBeTruthy();

    await switchTo(user, "按类型");

    expect(within(toggle).getByRole("button", { name: "按类型" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByRole("list", { name: "日期列表" })).toBeNull();
    expect(screen.getByRole("list", { name: "类型分组" })).toBeTruthy();
    expect((await moneyOverview())).toBeTruthy();

    await switchTo(user, "按天");

    expect(screen.getByRole("list", { name: "日期列表" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "类型分组" })).toBeNull();
  });
});

describe("类型组里有什么", () => {
  it("用到的类型各一组，按类型的顺序；组头写合计和笔数", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await switchTo(user, "按类型");

    expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["住宿", "餐饮", "游玩", "其他"]);
    expect(summaryOf("住宿")).toBe("¥800 · 3 笔");
    expect(summaryOf("餐饮")).toBe("¥30 · 1 笔");
    expect(summaryOf("其他")).toBe("¥600 · 1 笔");
  });

  it("每笔开销一行、写挂在哪块上；没挂开销的块一行空的；按行程的先后排，不挂块的在最后", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await switchTo(user, "按类型");

    expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "住宿费", "订房服务费"]);
    expect(rowsOf(groupOf("餐饮"))).toEqual(["早茶钱", "（空）10.2 周五 午饭"]);
    expect(expenseRowOf(groupOf("住宿"), "房费").querySelector("[data-expense-blocks]")?.textContent).toBe(
      "挂在 10.1 周四 民宿",
    );
    expect(expenseRowOf(groupOf("住宿"), "住宿费").querySelector("[data-expense-blocks]")?.textContent).toBe(
      "挂在 10.1 周四 横店",
    );
    expect(expenseRowOf(groupOf("其他"), "签证").querySelector("[data-expense-blocks]")?.textContent).toBe("不属于任何一天");
  });

  it("没填金额的，组头写「还有 N 笔没填」；只有空行的组写「还没有开销」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const inn = dayBlock(plan, library, oct1!, "民宿", "lodging");
      money(plan, library, "房费", 48000, "lodging", [inn]);
      money(plan, library, "押金", null, "lodging", [inn]);
      dayBlock(plan, library, oct1!, "午饭", "food");
    });
    await switchTo(user, "按类型");

    expect(summaryOf("住宿")).toBe("¥480 · 2 笔 · 还有 1 笔没填");
    expect(summaryOf("餐饮")).toBe("还没有开销");
  });
});

describe("在组里改", () => {
  it("空行填了金额就建一笔这个类型的开销，挂在那块上", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(trip);
    await switchTo(user, "按类型");

    const empty = groupOf("餐饮").querySelector<HTMLElement>("[data-empty-block-id]")!;
    await user.type(within(empty).getByRole("textbox", { name: "新一笔的金额" }), "45{Enter}");

    const other = await openOtherTab(planId);
    await waitFor(() => {
      const lunch = [...other.plan().blocks.values()].find((block) => block.title === "午饭")!;
      const created = [...other.plan().expenses.values()].find((expense) => expense.block_ids.includes(lunch.id));
      expect(created).toMatchObject({ amount_cents: 4500, kind: { id: "food" } });
    });
    await waitFor(() => expect(groupOf("餐饮").querySelector("[data-empty-block-id]")).toBeNull());
    expect(summaryOf("餐饮")).toBe("¥75 · 2 笔");
  });

  it("改一笔开销的类型：换到那个类型的组里，焦点跟过去", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await switchTo(user, "按类型");

    const fee = expenseRowOf(groupOf("住宿"), "住宿费");
    const expenseId = fee.dataset.expenseId!;
    await user.click(within(fee).getByRole("button", { name: /^类型：/ }));
    await user.click(within(screen.getByRole("dialog", { name: "选择类型" })).getByRole("button", { name: "游玩" }));

    await waitFor(() => expect(rowsOf(groupOf("游玩"))).toContain("住宿费"));
    expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "订房服务费"]);
    const moved = groupOf("游玩").querySelector<HTMLElement>(`[data-expense-id="${expenseId}"]`)!;
    await waitFor(() => expect(document.activeElement).toBe(within(moved).getByRole("button", { name: /^类型：/ })));
  });

  it("删一笔：这一行不见，焦点落到下一行的「删除这笔」；组里一行不剩整组不见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await switchTo(user, "按类型");

    await user.click(within(expenseRowOf(groupOf("住宿"), "住宿费")).getByRole("button", { name: "删除这笔" }));

    await waitFor(() => expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "订房服务费"]));
    await waitFor(() =>
      expect(document.activeElement).toBe(
        within(expenseRowOf(groupOf("住宿"), "订房服务费")).getByRole("button", { name: "删除这笔" }),
      ),
    );

    await user.click(within(expenseRowOf(groupOf("其他"), "签证")).getByRole("button", { name: "删除这笔" }));

    await waitFor(() => expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["住宿", "餐饮", "游玩"]));
  });
});

describe("按类型时的筛选", () => {
  it("按类型筛：只剩所选类型的组；挂在被筛掉的块上的开销就在组里，不写那一句", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await switchTo(user, "按类型");

    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "住宿" }));

    await waitFor(() => expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["住宿"]));
    expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "住宿费", "订房服务费"]);
    expect(screen.queryByText(/挂在被筛掉的事上/)).toBeNull();
  });

  it("只看没划掉的：开销看挂的块有没有划掉，不挂块的照旧；空行看块划没划掉", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const ids = trip(plan, library);
      // 只留西湖没划掉
      setBlockChecked(plan, ["民宿", "横店", "早茶", "午饭"].map((title) => ids[title]!), true);
    });
    await switchTo(user, "按类型");

    await user.click(screen.getByRole("button", { name: "只看没划掉的" }));

    await waitFor(() => expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["住宿", "游玩", "其他"]));
    expect(rowsOf(groupOf("住宿"))).toEqual(["订房服务费"]);
    expect(rowsOf(groupOf("游玩"))).toEqual(["门票"]);
    expect(summaryOf("住宿")).toBe("¥20 · 1 笔");
  });
});
