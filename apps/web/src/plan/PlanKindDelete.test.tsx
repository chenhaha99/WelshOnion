// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addKind } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

/** 自建类型「门票」，10.1 的「西湖」「灵隐寺」都用它。 */
function twoTicketBlocks(plan: Y.Doc, library: Y.Doc): void {
  const ticket = addKind(library, { name: "门票", color: "#6b8fb0" });
  if (!ticket.ok) throw new Error("建类型失败");
  const [oct1] = daysFromOct1(plan, 1);
  for (const title of ["西湖", "灵隐寺"]) {
    addBlock(plan, library, { baseId: oct1!, kindId: ticket.value.kindId, title, slot: "day" });
  }
}

async function openKindPicker(user: User, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: /^类型：/ }));
  return screen.getByRole("dialog", { name: "选择类型" });
}

async function openKindMenu(user: User, picker: HTMLElement, kindName: string): Promise<HTMLElement> {
  await user.click(within(picker).getByRole("button", { name: `「${kindName}」的操作` }));
  return within(picker).getByRole("menu");
}

describe("删除类型", () => {
  it("删有块在用的类型：先说明在用个数，确认后块写「已删除的类型」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const picker = await openKindPicker(user, "西湖");
    await user.click(within(await openKindMenu(user, picker, "门票")).getByRole("menuitem", { name: "删除…" }));
    expect(within(picker).getByText(/这个计划里有 2 个块在用/)).toBeTruthy();
    await user.click(within(picker).getByRole("button", { name: "删除" }));

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "类型：已删除的类型" })).toBeTruthy(),
    );
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：已删除的类型" })).toBeTruthy();
    expect(within(screen.getByRole("dialog", { name: "选择类型" })).queryByRole("button", { name: "门票" })).toBeNull();
  });

  it("取消删除", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const picker = await openKindPicker(user, "西湖");
    await user.click(within(await openKindMenu(user, picker, "门票")).getByRole("menuitem", { name: "删除…" }));
    await user.click(within(picker).getByRole("button", { name: "取消" }));

    expect(within(picker).getByRole("button", { name: "门票" })).toBeTruthy();
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：门票" })).toBeTruthy();
  });

  it("预设不能删：小菜单里没有删除项", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    const picker = await openKindPicker(user, "西湖");
    const menu = await openKindMenu(user, picker, "游玩");
    expect(within(menu).queryByRole("menuitem", { name: /删除/ })).toBeNull();
  });

  it("删除后按 Esc 仍能关掉：焦点先留在选择器里，关掉后回到类型按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const picker = await openKindPicker(user, "西湖");
    await user.click(within(await openKindMenu(user, picker, "门票")).getByRole("menuitem", { name: "删除…" }));
    await user.click(within(picker).getByRole("button", { name: "删除" }));
    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：已删除的类型" })).toBeTruthy(),
    );
    expect(picker.contains(document.activeElement)).toBe(true);

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "选择类型" })).toBeNull();
    expect(document.activeElement).toBe(
      within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：已删除的类型" }),
    );
  });
});
