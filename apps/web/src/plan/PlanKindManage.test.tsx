// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addKind, type LibraryView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherLibrary, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

/** 10.1 一天，放进这些没排时间的块：[标题, 类型 id]。 */
function oneDayWith(...blocks: Array<[string, string]>) {
  return (plan: Y.Doc, library: Y.Doc) => {
    const [oct1] = daysFromOct1(plan, 1);
    for (const [title, kindId] of blocks) addBlock(plan, library, { baseId: oct1!, kindId, title, slot: "day" });
  };
}

async function openKindPicker(user: User, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: /^类型：/ }));
  return screen.getByRole("dialog", { name: "选择类型" });
}

async function chooseKindAction(user: User, picker: HTMLElement, kindName: string, action: string): Promise<void> {
  await user.click(within(picker).getByRole("button", { name: `「${kindName}」的操作` }));
  await user.click(within(picker).getByRole("menuitem", { name: action }));
}

function kindNamed(library: LibraryView, name: string) {
  return [...library.kinds.values()].find((kind) => kind.name === name);
}

describe("新建类型", () => {
  it("新建并用上：同层是最上层，别的块也选得到", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["西湖", "sight"], ["灵隐寺", "sight"]));
    const otherLibrary = await openOtherLibrary();

    const picker = await openKindPicker(user, "西湖");
    await user.click(within(picker).getByRole("button", { name: "+ 新建类型" }));
    await user.type(within(picker).getByRole("textbox", { name: "名字" }), "门票");
    await user.click(within(picker).getByRole("button", { name: "确定" }));

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：门票" })).toBeTruthy(),
    );
    await user.keyboard("{Escape}");
    const other = await openKindPicker(user, "灵隐寺");
    expect(within(other).getByRole("button", { name: "门票" })).toBeTruthy();
    await waitFor(() =>
      expect(kindNamed(otherLibrary(), "门票")?.layer).toBe(kindNamed(otherLibrary(), "游玩")?.layer),
    );
  });

  it("名字为空不能建", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["西湖", "sight"]));

    const picker = await openKindPicker(user, "西湖");
    await user.click(within(picker).getByRole("button", { name: "+ 新建类型" }));
    expect(within(picker).getByRole("button", { name: "确定" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("改名、改颜色、改层", () => {
  it("改名：所有这个类型的块都变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["西湖", "sight"], ["灵隐寺", "sight"]));

    const picker = await openKindPicker(user, "西湖");
    await chooseKindAction(user, picker, "游玩", "改名…");
    const name = within(picker).getByRole("textbox", { name: "新名字" });
    await user.clear(name);
    await user.type(name, "玩{Enter}");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "类型：玩" })).toBeTruthy(),
    );
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：玩" })).toBeTruthy();
  });

  it("改颜色：块左边的颜色条跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["午饭", "food"]));
    const otherLibrary = await openOtherLibrary();

    const picker = await openKindPicker(user, "午饭");
    await chooseKindAction(user, picker, "餐饮", "改颜色…");
    await user.click(within(picker).getByRole("button", { name: "颜色 #6b8fb0" }));

    await waitFor(() => expect(kindNamed(otherLibrary(), "餐饮")?.color).toBe("#6b8fb0"));
    expect((await blockRow("10.1", "午饭")).style.getPropertyValue("--kind-color")).toBe("#6b8fb0");
  });

  it("改层：自建的门票改到停留那一层", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const ticket = addKind(library, { name: "门票", color: "#6b8fb0" });
      if (!ticket.ok) throw new Error("建类型失败");
      oneDayWith(["西湖", ticket.value.kindId])(plan, library);
    });
    const otherLibrary = await openOtherLibrary();

    const picker = await openKindPicker(user, "西湖");
    await chooseKindAction(user, picker, "门票", "改层…");
    await user.click(within(picker).getByRole("button", { name: /^第 0 层/ }));

    await waitFor(() => expect(kindNamed(otherLibrary(), "门票")?.layer).toBe(0));
  });
});
