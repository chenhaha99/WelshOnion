// @vitest-environment happy-dom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-render";
import { daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "../plan/test-helpers";
import { releaseAll } from "../storage/test-helpers";
import { markUsed } from "./help-usage";

beforeEach(() => localStorage.clear());

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  await releaseAll();
});

/** 一天、09:00 起 3 小时的西湖 */
async function planWithLake(): Promise<string> {
  return openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
  });
}

async function timeline(): Promise<HTMLElement> {
  await showView("时间线");
  return screen.findByRole("region", { name: "时间线" });
}

describe("场景小提示（照苹果 TipKit：嵌在界面里、一次一条、用过或点 ✕ 就不再出）", () => {
  it("电脑上第一次打开时间线：顶上一条「点空白处加一件事」，带「怎么用」和 ✕", async () => {
    await planWithLake();
    const region = await timeline();

    const tip = within(region).getByRole("note", { name: "提示：点空白处加一件事" });
    expect(within(tip).getByRole("link", { name: "怎么用" }).getAttribute("href")).toBe("#/help");
  });

  it("点 ✕：这条不再出，重开也不出", async () => {
    const user = userEvent.setup();
    const planId = await planWithLake();
    const region = await timeline();

    await user.click(within(region).getByRole("button", { name: "关掉提示" }));
    expect(within(region).queryByRole("note")).toBeNull();

    cleanup();
    renderApp(`#/plans/${planId}`);
    expect(within(await timeline()).queryByRole("note", { name: "提示：点空白处加一件事" })).toBeNull();
  });

  it("用过那个功能的不出（已经会了）", async () => {
    markUsed("blank-add");
    await planWithLake();
    const region = await timeline();

    expect(within(region).queryByRole("note")).toBeNull();
  });

  it("手机上选中一件事：出「拖两端改长短」", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await planWithLake();
    const region = await timeline();
    expect(within(region).queryByRole("note")).toBeNull();

    await user.click(within(region).getByRole("button", { name: /^西湖 / }));

    expect(within(region).getByRole("note", { name: "提示：拖两端改长短" })).toBeTruthy();

    // 点别处取消选中：提示还在（出来了就留到 ✕ 或离开这一屏），下面的东西不跳
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("toolbar", { name: "「西湖」的操作" })).toBeNull();
    expect(within(region).getByRole("note", { name: "提示：拖两端改长短" })).toBeTruthy();
  });

  it("一件事都没有的计划不出提示（那时候有「加第一件事」）", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const region = await timeline();
    expect(within(region).queryByRole("note")).toBeNull();
  });
});
