// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

/** 页顶那三个图标按钮。 */
function topButton(name: string): HTMLElement {
  return screen.getByRole("button", { name });
}

describe("页顶的三个图标", () => {
  it("计划设置、撤销、重做只剩图标：读屏名还在，上面没有文字", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const settings = await screen.findByRole("button", { name: "计划设置" });
    expect(settings.textContent).toBe("");
    expect(settings.getAttribute("title")).toBe("计划设置");
    expect(topButton("撤销").textContent).toBe("");
    expect(topButton("重做").textContent).toBe("");
    // 刚打开没东西可撤
    expect(topButton("撤销")).toHaveProperty("disabled", true);
    expect(topButton("重做")).toHaveProperty("disabled", true);
    expect(settings.querySelector("svg")).toBeTruthy();
  });
});

describe("计划设置是窗口", () => {
  it("点暗底关掉，焦点回到「计划设置」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const opener = await screen.findByRole("button", { name: "计划设置" });
    await user.click(opener);
    const settings = screen.getByRole("dialog", { name: "计划设置" });
    expect(settings.getAttribute("aria-modal")).toBe("true");

    // 窗口外面那一层：点它就关
    await user.click(settings.parentElement!);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "计划设置" })).toBeNull());
    expect(document.activeElement).toBe(opener);
  });

  it("点窗口里面不会关", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    await user.click(await screen.findByRole("button", { name: "计划设置" }));
    const settings = screen.getByRole("dialog", { name: "计划设置" });
    await user.click(within(settings).getByText("类型和状态"));

    expect(screen.getByRole("dialog", { name: "计划设置" })).toBeTruthy();
  });

  it("Esc 关掉，焦点回到点开它的地方（计划名）", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const name = await screen.findByRole("button", { name: "测试计划" });
    await user.click(name);
    expect(screen.getByRole("dialog", { name: "计划设置" })).toBeTruthy();

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "计划设置" })).toBeNull();
    expect(document.activeElement).toBe(name);
  });

  it("手机上照样打得开", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    await user.click(await screen.findByRole("button", { name: "计划设置" }));

    expect(screen.getByRole("dialog", { name: "计划设置" })).toBeTruthy();
  });
});
