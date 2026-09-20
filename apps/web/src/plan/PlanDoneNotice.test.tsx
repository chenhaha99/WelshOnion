// @vitest-environment happy-dom
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockLayer } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTitles, dayLabels, dayRow, daysFromOct1, openDayMenu, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function undated(plan: Y.Doc, library: Y.Doc, baseId: string, title: string): string {
  const result = addBlock(plan, library, { baseId, kindId: "sight", title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1：「西湖」「灵隐寺」，都没排时间。 */
function lakeAndTemple(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  undated(plan, library, oct1!, "西湖");
  undated(plan, library, oct1!, "灵隐寺");
}

/** 放删完提示的那块地方：一直在页面上，没有提示时是空的。 */
function notice(): Promise<HTMLElement> {
  return screen.findByRole("status", { name: "刚做完的提示" });
}

async function deleteRow(user: User, day: string, title: string, item = "删除"): Promise<void> {
  await user.click(within(await blockRow(day, title)).getByRole("button", { name: "这件事的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: item }));
}

describe("刚做完的提示", () => {
  it("删一件事再撤销：写删了什么，点「撤销」回来，提示不见，焦点在它的行菜单上", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAndTemple);

    await deleteRow(user, "10.1", "西湖");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了「西湖」"));
    await user.click(within(region).getByRole("button", { name: "撤销" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));
    expect(region.textContent).toBe("");
    const menu = within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" });
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });

  it("连同里面的块：写「和里面的 1 件」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const outer = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "横店一整天", minute: 480, duration: 720 });
      const inner = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      if (!outer.ok || !inner.ok) throw new Error("建块失败");
      setBlockLayer(plan, library, inner.value.blockId, outer.value.blockId);
    });

    await deleteRow(user, "10.1", "横店一整天", "删除（连同里面的 1 个）");

    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了「横店一整天」和里面的 1 件"));
  });

  it("删一天：写这天的标签和这天有几件事；撤销后这天回来，焦点在这天的菜单上", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [, oct2] = daysFromOct1(plan, 3);
      undated(plan, library, oct2!, "乌镇");
    });

    const menu = await openDayMenu(user, "10.2");
    await user.click(within(menu).getByRole("menuitem", { name: "删除这天" }));

    await waitFor(async () => expect((await dayLabels()).some((label) => label.includes("10.2"))).toBe(false));
    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了第 2 天 · 10.2 周五，连同这天的 1 件事"));
    await user.click(within(region).getByRole("button", { name: "撤销" }));

    await waitFor(async () => expect(await blockTitles("10.2")).toEqual(["乌镇"]));
    const dayMenu = within(await dayRow("10.2")).getByRole("button", { name: "这天的操作" });
    await waitFor(() => expect(document.activeElement).toBe(dayMenu));
  });

  it("删一笔开销：有说明写说明，没说明写金额，后删的换掉先删的；撤销后那笔回来，焦点在它的金额框上", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lunch = undated(plan, library, oct1!, "午饭");
      for (const [title, cents] of [
        ["面", 12000],
        ["", 3850],
      ] as const) {
        const result = addExpense(plan, library, { title, amountCents: cents, blockIds: [lunch] });
        if (!result.ok) throw new Error("建开销失败");
      }
    });

    await user.click(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "开销" }));
    const editor = screen.getByRole("group", { name: "午饭 的开销" });
    const rows = () => [...editor.querySelectorAll<HTMLElement>("[data-expense-id]")];
    const noodles = rows().find((row) => row.querySelector<HTMLInputElement>("input[aria-label='说明']")?.value === "面");
    await user.click(within(noodles!).getByRole("button", { name: "删除这笔" }));
    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了「面」这笔开销"));

    await waitFor(() => expect(rows()).toHaveLength(1));
    await user.click(within(rows()[0]!).getByRole("button", { name: "删除这笔" }));
    await waitFor(() => expect(region.textContent).toContain("删掉了 ¥38.50 这笔开销"));
    expect(region.textContent).not.toContain("删掉了「面」");
    await user.click(within(region).getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(rows()).toHaveLength(1));
    const amount = within(rows()[0]!).getByRole("textbox", { name: "金额" });
    expect((amount as HTMLInputElement).value).toBe("38.5");
    await waitFor(() => expect(document.activeElement).toBe(amount));
  });

  it("之后又改了计划：提示马上不见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAndTemple);
    await deleteRow(user, "10.1", "西湖");
    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了「西湖」"));

    const title = within(await blockRow("10.1", "灵隐寺")).getByRole("textbox", { name: "标题" });
    await user.clear(title);
    await user.type(title, "灵隐{Enter}");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐"]));
    expect(region.textContent).toBe("");
  });

  it("按 Ctrl+Z 撤销：提示不见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAndTemple);
    await deleteRow(user, "10.1", "西湖");
    const region = await notice();
    await waitFor(() => expect(region.textContent).toContain("删掉了「西湖」"));

    await user.keyboard("{Control>}z{/Control}");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));
    expect(region.textContent).toBe("");
  });

  it("8 秒后提示不见；页顶的「撤销」照样能撤", async () => {
    await openStoredPlan(lakeAndTemple);
    const region = await notice();
    await blockRow("10.1", "西湖");
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

    await deleteRow(user, "10.1", "西湖");
    await waitFor(() => expect(region.textContent).toContain("删掉了「西湖」"));

    act(() => vi.advanceTimersByTime(6_000));
    expect(region.textContent).toContain("删掉了「西湖」");
    act(() => vi.advanceTimersByTime(2_500));
    await waitFor(() => expect(region.textContent).toBe(""));

    await user.click(screen.getByRole("button", { name: "撤销" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));
  });
});
