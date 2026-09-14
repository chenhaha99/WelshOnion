// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addKind, deleteKind } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

describe("类型选择器", () => {
  it("选一个类型：选完关掉", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "午饭", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "类型：游玩" }));
    const picker = screen.getByRole("dialog", { name: "选择类型" });
    expect(within(picker).getByRole("button", { name: "游玩" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(within(picker).getByRole("button", { name: "餐饮" }));

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "类型：餐饮" })).toBeTruthy(),
    );
    expect(screen.queryByRole("dialog", { name: "选择类型" })).toBeNull();
  });

  it("已删除的类型改成别的", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const ticket = addKind(library, { name: "门票", color: "#6b8fb0" });
      if (!ticket.ok) throw new Error("建类型失败");
      addBlock(plan, library, { baseId: oct1!, kindId: ticket.value.kindId, title: "西湖", slot: "day" });
      deleteKind(library, ticket.value.kindId);
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：已删除的类型" }));
    await user.click(within(screen.getByRole("dialog", { name: "选择类型" })).getByRole("button", { name: "游玩" }));
    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：游玩" })).toBeTruthy(),
    );
  });

  it("Esc 关掉，焦点回到类型按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    const trigger = within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：游玩" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "选择类型" })).toBeNull();
    expect(document.activeElement).toBe(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：游玩" }));
  });
});
