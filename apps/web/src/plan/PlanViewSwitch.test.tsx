// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  daysFromOct1,
  openStoredPlan,
  overviewCard,
  pressedView,
  showView,
} from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 10.1 有排上时间的「西湖」（游玩）、「午饭」（餐饮）：用到两种类型，「按类型筛选」那一排在，时间线上有横条。 */
function lakeOnOct1(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  const lake = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
  const lunch = addBlock(plan, library, { baseId: oct1!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
  if (!lake.ok || !lunch.ok) throw new Error("建块失败");
}

async function viewSwitch(): Promise<HTMLElement> {
  return screen.findByRole("group", { name: "视图" });
}

/** second 在页面里排在 first 后面。 */
function follows(first: Element, second: Element): boolean {
  return (first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

describe("时间线和日程切换着看", () => {
  it("第一次打开是时间线：主版面只有筛选、切换和时间线，总览在「总览」里", async () => {
    await openStoredPlan(lakeOnOct1);

    const views = await viewSwitch();
    expect(within(views).getAllByRole("button").map((button) => button.textContent)).toEqual(["时间线", "日程", "总览"]);
    expect(pressedView()).toBe("时间线");
    const timeline = screen.getByRole("region", { name: "时间线" });
    expect(screen.queryByRole("list", { name: "每天" })).toBeNull();
    expect(screen.getByRole("group", { name: "按类型筛选" })).toBeTruthy();
    // 出发日期、总览都不在主版面上
    expect(screen.queryByLabelText("出发日期")).toBeNull();
    expect(screen.queryByRole("region", { name: "总览" })).toBeNull();
    // 切换按钮在筛选和视图中间
    expect(follows(screen.getByRole("group", { name: "按类型筛选" }), views)).toBe(true);
    expect(follows(views, timeline)).toBe(true);

    await showView("总览");
    expect(await overviewCard()).toBeTruthy();
  });

  it("「标题」「开销」和放大条在切换按钮那一行，只有看时间线时才有", async () => {
    await openStoredPlan(lakeOnOct1);

    const views = await viewSwitch();
    const row = views.parentElement!;
    expect(within(row).getByRole("group", { name: "条上写" })).toBeTruthy();
    expect(within(row).getByRole("slider", { name: "横向放大" })).toBeTruthy();

    await showView("日程");
    expect(screen.queryByRole("group", { name: "条上写" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "横向放大" })).toBeNull();

    await showView("总览");
    expect(screen.queryByRole("group", { name: "条上写" })).toBeNull();
  });

  it("切到日程：只有每天的列表，没有「分组」；筛选、总览还在", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);

    await user.click(within(await viewSwitch()).getByRole("button", { name: "日程" }));

    expect(pressedView()).toBe("日程");
    expect(screen.getByRole("list", { name: "每天" })).toBeTruthy();
    // 「按类型」分组撤掉了（你提的：按类型用上面的筛选）
    expect(screen.queryByRole("group", { name: "分组" })).toBeNull();
    expect(screen.queryByRole("region", { name: "时间线" })).toBeNull();
    expect(screen.getByRole("group", { name: "按类型筛选" })).toBeTruthy();
    expect(await overviewCard()).toBeTruthy();
    // 切视图不改计划：撤销还是灰的
    expect(screen.getByRole("button", { name: "撤销" })).toHaveProperty("disabled", true);
  });

  it("按下的筛选：切到时间线再切回来还在", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);
    await user.click(within(await screen.findByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));
    await user.click(within(await viewSwitch()).getByRole("button", { name: "日程" }));

    await user.click(within(await viewSwitch()).getByRole("button", { name: "时间线" }));
    await user.click(within(await viewSwitch()).getByRole("button", { name: "日程" }));

    const kinds = screen.getByRole("group", { name: "按类型筛选" });
    expect(within(kinds).getByRole("button", { name: "游玩" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("记住这个计划上次看的：回到计划列表再打开，还是时间线", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeOnOct1);
    await user.click(within(await viewSwitch()).getByRole("button", { name: "时间线" }));

    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    await user.click(await screen.findByRole("link", { name: /^测试计划/ }));

    await waitFor(() => expect(pressedView()).toBe("时间线"));
    expect(await screen.findByRole("region", { name: "时间线" })).toBeTruthy();
    expect(screen.queryByRole("list", { name: "每天" })).toBeNull();
  });
});

// 手指按住横条要拿起来拖：宽屏的触屏设备（平板）上时间线能拖，手机上这一版不能拖，所以在宽屏上测
describe("切视图和手指按住", () => {
  it("手指刚抬起就切到日程再切回来，新按住的这次页面还是不能选字", async () => {
    await openStoredPlan(lakeOnOct1);
    await showView("时间线");
    document.documentElement.style.removeProperty("user-select");
    const lake = () => screen.getByRole("button", { name: /^西湖 / }).closest<HTMLElement>("[data-segment]")!;
    fireEvent.pointerDown(await waitFor(lake), { pointerType: "touch", pointerId: 1 });
    fireEvent.pointerUp(window, { pointerType: "touch", pointerId: 1 });

    // 卸掉又装上时间线，马上再按住
    await showView("日程");
    await showView("时间线");
    fireEvent.pointerDown(await waitFor(lake), { pointerType: "touch", pointerId: 2 });
    // 上一次抬起后要等 300 毫秒才恢复选字：等过这段（还不到长按拿起来的 500 毫秒）
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(document.documentElement.style.getPropertyValue("user-select")).toBe("none");
    fireEvent.pointerUp(window, { pointerType: "touch", pointerId: 2 });
  });
});
