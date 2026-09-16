// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addKind, type LibraryView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherLibrary, openPlanSettings, openStoredPlan } from "./test-helpers";

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

/** 打开计划设置里的「类型的管理」。 */
async function openKindManager(user: User): Promise<HTMLElement> {
  const settings = await openPlanSettings(user, "类型和状态");
  return within(settings).getByRole("group", { name: "类型的管理" });
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
  it("在设置里改名：所有这个类型的块都变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["西湖", "sight"], ["灵隐寺", "sight"]));

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "改名：游玩" }));
    const name = within(manager).getByRole("textbox", { name: "新名字" });
    await user.clear(name);
    await user.type(name, "玩{Enter}");
    await user.keyboard("{Escape}");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "类型：玩" })).toBeTruthy(),
    );
    expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "类型：玩" })).toBeTruthy();
  });

  it("设置里写着每个类型这个计划用了几件，顶上说明所有计划共用", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["西湖", "sight"], ["灵隐寺", "sight"], ["午饭", "food"]));

    const manager = await openKindManager(user);
    const rows = within(manager)
      .getAllByRole("button", { name: /^改名：/ })
      .map((button) => button.getAttribute("aria-label")!.replace("改名：", ""));
    expect(rows).toContain("游玩");
    expect(rows).toContain("住宿");
    expect(manager.textContent).toContain("这个计划里 2 件在用");
    expect(manager.textContent).toContain("没有在用的");
    expect(screen.getByRole("dialog", { name: "计划设置" }).textContent).toContain("所有计划共用");
  });

  it("在设置里改颜色：块左边的颜色条跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith(["午饭", "food"]));
    const otherLibrary = await openOtherLibrary();

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "改颜色：餐饮" }));
    await user.click(within(manager).getByRole("button", { name: "颜色 #6b8fb0" }));
    await user.keyboard("{Escape}");

    await waitFor(() => expect(kindNamed(otherLibrary(), "餐饮")?.color).toBe("#6b8fb0"));
    expect((await blockRow("10.1", "午饭")).style.getPropertyValue("--kind-color")).toBe("#6b8fb0");
  });

  it("在设置里改层：自建的门票改到停留那一层", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const ticket = addKind(library, { name: "门票", color: "#6b8fb0" });
      if (!ticket.ok) throw new Error("建类型失败");
      oneDayWith(["西湖", ticket.value.kindId])(plan, library);
    });
    const otherLibrary = await openOtherLibrary();

    const manager = await openKindManager(user);
    await user.click(within(manager).getByRole("button", { name: "改层：门票" }));
    await user.click(within(manager).getByRole("button", { name: /^第 0 层/ }));

    await waitFor(() => expect(kindNamed(otherLibrary(), "门票")?.layer).toBe(0));
  });
});
