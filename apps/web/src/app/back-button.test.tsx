// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockRow, daysFromOct1, openOtherTab, openStoredPlan, showView } from "../plan/test-helpers";
import { releaseAll } from "../storage/test-helpers";
import { registerBackButton } from "./back-button";
import { renderApp } from "./test-render";

// 这个文件里的测试都当作在 app 里跑：Capacitor 说是原生平台，返回键的监听和退出 app 换成假的
const app = vi.hoisted(() => ({
  listeners: [] as Array<(event: { canGoBack: boolean }) => void>,
  exitApp: vi.fn(async () => {}),
}));
vi.mock("@capacitor/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@capacitor/core")>();
  return { ...original, Capacitor: { ...original.Capacitor, isNativePlatform: () => true } };
});
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: vi.fn(async (event: string, listener: (event: { canGoBack: boolean }) => void) => {
      if (event === "backButton") app.listeners.push(listener);
      return { remove: async () => {} };
    }),
    exitApp: app.exitApp,
  },
}));

afterEach(async () => {
  cleanup();
  app.listeners.length = 0;
  app.exitApp.mockClear();
  await releaseAll();
});

/** 按一下安卓的返回键 */
function pressBack(): void {
  for (const listener of app.listeners) listener({ canGoBack: false });
}

describe("返回键", () => {
  it("开着设置：关掉设置，还在计划列表", async () => {
    const user = userEvent.setup();
    await registerBackButton();
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "设置" }));
    expect(screen.getByRole("dialog", { name: "设置" })).toBeTruthy();

    pressBack();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "设置" })).toBeNull());
    // 一个计划都没有时列表页没有「我的计划」标题，看「新建第一个计划」还在
    expect(screen.getByRole("button", { name: "新建第一个计划" })).toBeTruthy();
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it("在计划页：存下没回车的标题，回到计划列表", async () => {
    const user = userEvent.setup();
    await registerBackButton();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    const other = await openOtherTab(planId);

    await showView("列表");
    const title = await screen.findByDisplayValue("西湖");
    await user.clear(title);
    await user.type(title, "杭州");

    pressBack();

    await screen.findByRole("heading", { name: "我的计划", level: 1 });
    expect(window.location.hash).toBe("#/");
    await waitFor(() => expect([...other.plan().blocks.values()].map((block) => block.title)).toEqual(["杭州"]));
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it("开着详情面板：先存下没回车的短备注，再关面板，还在计划页", async () => {
    const user = userEvent.setup();
    await registerBackButton();
    const planId = await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    const other = await openOtherTab(planId);

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "详情…" }));
    const panel = screen.getByRole("dialog", { name: "西湖" });
    await user.click(within(panel).getByRole("button", { name: "加备注" }));
    await user.type(within(panel).getByLabelText("短备注"), "看落日");

    pressBack();

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull());
    expect(window.location.hash).toBe(`#/plans/${planId}`);
    await waitFor(() => expect([...other.plan().blocks.values()].map((block) => block.subtitle)).toEqual(["看落日"]));
    expect(app.exitApp).not.toHaveBeenCalled();
  });

  it("详情面板里时间的编辑区开着：先收起编辑区，面板还开着", async () => {
    const user = userEvent.setup();
    await registerBackButton();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "详情…" }));
    const panel = screen.getByRole("dialog", { name: "西湖" });
    await user.click(within(panel).getByRole("button", { name: "时间" }));
    await user.click(within(within(panel).getByRole("group", { name: "西湖 的时间" })).getByLabelText("开始"));

    pressBack();

    await waitFor(() => expect(within(panel).queryByRole("group", { name: "西湖 的时间" })).toBeNull());
    expect(screen.getByRole("dialog", { name: "西湖" })).toBeTruthy();
  });

  it("在计划列表、什么都没开：退出 app", async () => {
    await registerBackButton();
    renderApp("#/");
    await screen.findByRole("button", { name: "新建第一个计划" });

    pressBack();

    expect(app.exitApp).toHaveBeenCalledTimes(1);
  });
});
