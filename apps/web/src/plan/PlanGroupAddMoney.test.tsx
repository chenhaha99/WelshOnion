// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockChecked } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openOtherTab, openStoredPlan, showView } from "./test-helpers";

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

/** 10.1「民宿」（住宿）挂 480 房费；10.2「酒店」（住宿）、「西湖」（游玩）没挂开销。返回 10.2 那两件的 id。 */
function twoNights(plan: Y.Doc, library: Y.Doc): { hotel: string; lake: string } {
  const [oct1, oct2] = daysFromOct1(plan, 2);
  const inn = dayBlock(plan, library, oct1!, "民宿", "lodging");
  const hotel = dayBlock(plan, library, oct2!, "酒店", "lodging");
  const lake = dayBlock(plan, library, oct2!, "西湖", "sight");
  const result = addExpense(plan, library, { title: "房费", amountCents: 48000, kindId: "lodging", blockIds: [inn] });
  if (!result.ok) throw new Error("建开销失败");
  return { hotel, lake };
}

async function byKind(user: User): Promise<void> {
  await showView("日程");
  await user.click(within(await screen.findByRole("group", { name: "分组" })).getByRole("button", { name: "按类型" }));
}

function groups(): HTMLElement[] {
  return within(screen.getByRole("list", { name: "类型分组" })).getAllByRole("listitem");
}

function groupOf(kind: string): HTMLElement {
  const group = groups().find((item) => item.getAttribute("aria-label") === kind);
  if (!group) throw new Error(`没有「${kind}」组`);
  return group;
}

function addRowOf(kind: string): HTMLElement {
  const row = groupOf(kind).querySelector<HTMLElement>("[data-add-row]");
  if (!row) throw new Error(`「${kind}」组末尾没有加一笔`);
  return row;
}

/** 组里的行，按显示顺序：开销写说明，没挂开销的块写「（空）块的名字」。 */
function rowsOf(group: HTMLElement): string[] {
  return [...group.querySelectorAll<HTMLElement>("[data-expense-id], [data-empty-block-id]")].map((row) =>
    row.hasAttribute("data-expense-id")
      ? row.querySelector<HTMLInputElement>("input[aria-label='说明']")!.value
      : `（空）${row.querySelector("[data-block-label]")!.textContent}`,
  );
}

function optionTexts(select: HTMLElement): string[] {
  return within(select)
    .getAllByRole("option")
    .map((option) => option.textContent ?? "");
}

describe("每组末尾加一笔", () => {
  it("挂到一块：建一笔这个类型的开销挂上；填完清空，挂到回到「不属于任何一天」，焦点还在金额", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(twoNights);
    await byKind(user);

    const row = addRowOf("住宿");
    expect(optionTexts(within(row).getByRole("combobox", { name: "挂到" }))).toEqual([
      "不属于任何一天",
      "10.1 周四 民宿",
      "10.2 周五 酒店",
      "10.2 周五 西湖",
    ]);
    await user.selectOptions(within(row).getByRole("combobox", { name: "挂到" }), "10.1 周四 民宿");
    await user.type(within(row).getByRole("textbox", { name: "新一笔的说明" }), "第二晚");
    await user.type(within(row).getByRole("textbox", { name: "新一笔的金额" }), "300{Enter}");

    const other = await openOtherTab(planId);
    await waitFor(() => {
      const inn = [...other.plan().blocks.values()].find((block) => block.title === "民宿")!;
      const created = [...other.plan().expenses.values()].find((expense) => expense.title === "第二晚");
      expect(created).toMatchObject({ amount_cents: 30000, kind: { id: "lodging" }, block_ids: [inn.id] });
    });
    await waitFor(() => expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "第二晚", "（空）10.2 周五 酒店"]));
    const after = addRowOf("住宿");
    expect((within(after).getByRole("combobox", { name: "挂到" }) as HTMLSelectElement).value).toBe("");
    expect((within(after).getByRole("textbox", { name: "新一笔的金额" }) as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(within(after).getByRole("textbox", { name: "新一笔的金额" }));
  });

  it("不属于任何一天（默认）：这个类型的开销排在组的最后", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(twoNights);
    await byKind(user);

    const row = addRowOf("住宿");
    await user.type(within(row).getByRole("textbox", { name: "新一笔的说明" }), "服务费");
    await user.type(within(row).getByRole("textbox", { name: "新一笔的金额" }), "20{Enter}");

    const other = await openOtherTab(planId);
    await waitFor(() => {
      const created = [...other.plan().expenses.values()].find((expense) => expense.title === "服务费");
      expect(created).toMatchObject({ amount_cents: 2000, kind: { id: "lodging" }, block_ids: [] });
    });
    await waitFor(() => expect(rowsOf(groupOf("住宿"))).toEqual(["房费", "（空）10.2 周五 酒店", "服务费"]));
  });

  it("挂到只列通过筛选的块", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { hotel, lake } = twoNights(plan, library);
      setBlockChecked(plan, [hotel, lake], true);
    });
    await byKind(user);

    await user.click(screen.getByRole("button", { name: "只看没划掉的" }));

    await waitFor(() =>
      expect(optionTexts(within(addRowOf("住宿")).getByRole("combobox", { name: "挂到" }))).toEqual([
        "不属于任何一天",
        "10.1 周四 民宿",
      ]),
    );
  });
});

describe("加一笔别的类型的开销", () => {
  it("选类型、填金额：那一类的组出现", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(twoNights);
    await byKind(user);

    const region = screen.getByRole("region", { name: "加一笔别的类型的开销" });
    // 看得见的字也要说清是加开销的地方，只写「别的类型」看不出来
    expect(within(region).getByText("加一笔别的类型")).toBeTruthy();
    await user.selectOptions(within(region).getByRole("combobox", { name: "类型" }), "购物");
    await user.type(within(region).getByRole("textbox", { name: "新一笔的说明" }), "纪念品");
    await user.type(within(region).getByRole("textbox", { name: "新一笔的金额" }), "99{Enter}");

    const other = await openOtherTab(planId);
    await waitFor(() => {
      const created = [...other.plan().expenses.values()].find((expense) => expense.title === "纪念品");
      expect(created).toMatchObject({ amount_cents: 9900, kind: { id: "shopping" }, block_ids: [] });
    });
    await waitFor(() => expect(groups().map((group) => group.getAttribute("aria-label"))).toEqual(["住宿", "游玩", "购物"]));
  });

  it("类型默认是其他；按了按类型筛时只能选按下的那几类", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoNights);
    await byKind(user);

    const kindSelect = () =>
      within(screen.getByRole("region", { name: "加一笔别的类型的开销" })).getByRole("combobox", { name: "类型" }) as HTMLSelectElement;
    expect(kindSelect().selectedOptions[0]!.textContent).toBe("其他");
    expect(optionTexts(kindSelect())).toEqual(["停留", "住宿", "交通", "餐饮", "游玩", "购物", "其他"]);

    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "住宿" }));

    await waitFor(() => expect(optionTexts(kindSelect())).toEqual(["住宿"]));
  });
});
