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

/** 删除搬到了计划设置里：打开设置的「类型的管理」。 */
async function openKindManager(user: User): Promise<HTMLElement> {
  await user.click(await screen.findByRole("button", { name: "计划设置" }));
  const settings = await screen.findByRole("dialog", { name: "计划设置" });
  return within(settings).getByRole("group", { name: "类型的管理" });
}

describe("删除类型", () => {
  it("删有块在用的类型：先说明在用个数，确认后块写「已删除的类型」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "删除：门票" }));
    expect(within(manager).getByText(/这个计划里有 2 件事在用/)).toBeTruthy();
    await user.click(within(manager).getByRole("button", { name: "删除" }));
    await user.keyboard("{Escape}");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "类型：已删除的类型" })).toBeTruthy(),
    );
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：已删除的类型" })).toBeTruthy();
    // 选择器里也没有它了
    const picker = await openKindPicker(user, "西湖");
    expect(within(picker).queryByRole("button", { name: "门票" })).toBeNull();
  });

  it("取消删除", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "删除：门票" }));
    await user.click(within(manager).getByRole("button", { name: "取消" }));

    expect(within(manager).getByRole("button", { name: "改名：门票" })).toBeTruthy();
    await user.keyboard("{Escape}");
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：门票" })).toBeTruthy();
  });

  it("预设不能删：设置里那一行没有删除", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    const manager = await openKindManager(user);
    expect(within(manager).getByRole("button", { name: "改名：游玩" })).toBeTruthy();
    expect(within(manager).queryByRole("button", { name: "删除：游玩" })).toBeNull();
  });

  it("删完设置还开着，按 Esc 关掉、焦点回到「计划设置」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoTicketBlocks);

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "删除：门票" }));
    await user.click(within(manager).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(within(manager).queryByRole("button", { name: "改名：门票" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "计划设置" })).toBeTruthy();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "计划设置" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "计划设置" }));
  });
});
