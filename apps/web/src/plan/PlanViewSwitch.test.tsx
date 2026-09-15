// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, pressedView, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 10.1 有一件排上时间的「西湖」（待定）：「只看」那一排在，时间轴上有横条。 */
function lakeOnOct1(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  const result = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
  if (!result.ok) throw new Error("建块失败");
}

async function viewSwitch(): Promise<HTMLElement> {
  return screen.findByRole("group", { name: "视图" });
}

/** second 在页面里排在 first 后面。 */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("时间轴和列表切换着看", () => {
  it("第一次打开是列表：有日期列表和分组，没有时间轴；筛选、钱的总览、占比都在", async () => {
    await openStoredPlan(lakeOnOct1);

    const views = await viewSwitch();
    expect(within(views).getAllByRole("button").map((button) => button.textContent)).toEqual(["时间轴", "列表"]);
    expect(pressedView()).toBe("列表");
    expect(screen.getByRole("list", { name: "日期列表" })).toBeTruthy();
    expect(screen.getByRole("group", { name: "分组" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "时间轴" })).toBeNull();
    expect(screen.getByRole("group", { name: "按状态筛选" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "钱的总览" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "占比" })).toBeTruthy();
  });

  it("切到时间轴：只有时间轴卡片；筛选、钱的总览、占比还在，切换按钮在占比和时间轴中间", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);

    await user.click(within(await viewSwitch()).getByRole("button", { name: "时间轴" }));

    expect(pressedView()).toBe("时间轴");
    const timeline = screen.getByRole("region", { name: "时间轴" });
    expect(screen.queryByRole("list", { name: "日期列表" })).toBeNull();
    expect(screen.queryByRole("group", { name: "分组" })).toBeNull();
    expect(screen.getByRole("group", { name: "按状态筛选" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "钱的总览" })).toBeTruthy();
    const views = screen.getByRole("group", { name: "视图" });
    expect(follows(screen.getByRole("region", { name: "占比" }), views)).toBe(true);
    expect(follows(views, timeline)).toBe(true);
    // 切视图不改计划：撤销还是灰的
    expect(screen.getByRole("button", { name: "撤销" })).toHaveProperty("disabled", true);
  });

  it("按下的筛选和分组：切到时间轴再切回来还在", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);
    await user.click(within(await screen.findByRole("group", { name: "按状态筛选" })).getByRole("button", { name: "已确认" }));
    await user.click(within(screen.getByRole("group", { name: "分组" })).getByRole("button", { name: "按类型" }));

    await user.click(within(await viewSwitch()).getByRole("button", { name: "时间轴" }));
    await user.click(within(await viewSwitch()).getByRole("button", { name: "列表" }));

    const statuses = screen.getByRole("group", { name: "按状态筛选" });
    expect(within(statuses).getByRole("button", { name: "已确认" }).getAttribute("aria-pressed")).toBe("true");
    const grouping = screen.getByRole("group", { name: "分组" });
    expect(within(grouping).getByRole("button", { name: "按类型" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("记住这个计划上次看的：回到计划列表再打开，还是时间轴", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);
    await user.click(within(await viewSwitch()).getByRole("button", { name: "时间轴" }));

    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    await user.click(await screen.findByRole("link", { name: /^测试计划/ }));

    await waitFor(() => expect(pressedView()).toBe("时间轴"));
    expect(await screen.findByRole("region", { name: "时间轴" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "日期列表" })).toBeNull();
  });
});

describe("切视图和手指按住", () => {
  beforeEach(() => stubNarrowScreen());
  afterEach(() => vi.unstubAllGlobals());

  it("手指刚抬起就切到列表再切回来，新按住的这次页面还是不能选字", async () => {
    await openStoredPlan(lakeOnOct1);
    await showView("时间轴");
    document.documentElement.style.removeProperty("user-select");
    const lake = () => screen.getByRole("button", { name: /^西湖 / }).closest<HTMLElement>("[data-segment]")!;
    fireEvent.pointerDown(await waitFor(lake), { pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(window, { pointerType: "touch", pointerId: 1 });

    // 卸掉又装上时间轴，马上再按住
    await showView("列表");
    await showView("时间轴");
    fireEvent.pointerDown(await waitFor(lake), { pointerType: "touch", pointerId: 2 });
    // 上一次抬起后要等 300 毫秒才恢复选字：等过这段（还不到长按拿起来的 500 毫秒）
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(document.documentElement.style.getPropertyValue("user-select")).toBe("none");
    fireEvent.pointerUp(window, { pointerType: "touch", pointerId: 2 });
  });
});
