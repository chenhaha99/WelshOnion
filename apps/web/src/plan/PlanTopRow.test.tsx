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

/** 页顶那一行：返回、计划名、三个图标。 */
async function topRow(): Promise<HTMLElement> {
  const name = await screen.findByRole("heading", { name: "测试计划" });
  return name.closest<HTMLElement>("[data-top-row]")!;
}

describe("页顶那一行", () => {
  it("一行里依次是返回、计划名、三个图标；计划名不另占一行", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const row = await topRow();
    const parts = [...row.children];
    expect(parts).toHaveLength(3);
    expect(within(parts[0] as HTMLElement).getByRole("link", { name: "我的计划" }).textContent).toBe("← 我的计划");
    expect(parts[1]!.getAttribute("role") ?? parts[1]!.tagName).toBe("H1");
    expect(parts[1]!.textContent).toBe("测试计划");
    expect(within(parts[2] as HTMLElement).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(
      ["计划设置", "撤销", "重做"],
    );
    // 页面上只有这一处写着计划名的标题
    expect(screen.getAllByRole("heading", { name: "测试计划" })).toHaveLength(1);
  });

  it("点计划名打开设置，Esc 关掉后焦点回到计划名", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const name = within(await topRow()).getByRole("button", { name: "测试计划" });
    await user.click(name);
    await screen.findByRole("dialog", { name: "计划设置" });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "计划设置" })).toBeNull());
    expect(document.activeElement).toBe(name);
  });

  it("手机上返回只写「←」，读屏名还是「我的计划」", async () => {
    stubNarrowScreen();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const back = within(await topRow()).getByRole("link", { name: "我的计划" });
    expect(back.textContent).toBe("←");
  });
});
