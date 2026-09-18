// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { renderApp } from "../app/test-render";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

function lakePlan(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  const result = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
  if (!result.ok) throw new Error("建块失败");
}

async function timeline(): Promise<HTMLElement> {
  await showView("时间线");
  return screen.findByRole("region", { name: "时间线" });
}

function zoomButton(name: string): HTMLElement {
  return within(screen.getByRole("group", { name: "竖向放大" })).getByRole("button", { name });
}

/** 竖轴有多高（像素）：24 小时 × 每小时多高。 */
function axisHeight(region: HTMLElement): string {
  return region.querySelector<HTMLElement>("[data-day-scroll] > div")!.style.height;
}

describe("竖排能放大缩小", () => {
  it("默认 100%：每小时 48 像素；点 200% 高一倍，点 50% 矮一半", async () => {
    stubNarrowScreen();
    await openStoredPlan(lakePlan);
    const user = userEvent.setup();
    const region = await timeline();

    expect(zoomButton("100%").getAttribute("aria-pressed")).toBe("true");
    expect(zoomButton("50%").getAttribute("aria-pressed")).toBe("false");
    expect(axisHeight(region)).toBe("1152px");

    await user.click(zoomButton("200%"));
    expect(zoomButton("200%").getAttribute("aria-pressed")).toBe("true");
    expect(axisHeight(region)).toBe("2304px");

    await user.click(zoomButton("50%"));
    expect(axisHeight(region)).toBe("576px");
  });

  it("换档时框正中间的钟点不变", async () => {
    stubNarrowScreen();
    await openStoredPlan(lakePlan);
    const user = userEvent.setup();
    const region = await timeline();
    const scroller = region.querySelector<HTMLElement>("[data-day-scroll]")!;
    Object.defineProperty(scroller, "clientHeight", { configurable: true, value: 448 });
    // 滚到 10:00 在最上面：正中间是 10:00 + 224 像素 = 14:40
    scroller.scrollTop = 480;
    fireEvent.scroll(scroller);

    await user.click(zoomButton("200%"));

    // 14:40 在每小时 96 像素时是 1408 像素，放到正中间要滚到 1408 − 224
    await waitFor(() => expect(scroller.scrollTop).toBe(1184));
  });

  it("记在这台设备上，按计划记", async () => {
    stubNarrowScreen();
    const planId = await openStoredPlan(lakePlan);
    const user = userEvent.setup();
    await timeline();
    await user.click(zoomButton("200%"));

    cleanup();
    renderApp(`#/plans/${planId}`);
    await screen.findByRole("region", { name: "时间线" });
    expect(zoomButton("200%").getAttribute("aria-pressed")).toBe("true");

    cleanup();
    await openStoredPlan(lakePlan);
    await timeline();
    expect(zoomButton("100%").getAttribute("aria-pressed")).toBe("true");
  });

  it("电脑上没有", async () => {
    await openStoredPlan(lakePlan);
    await timeline();

    expect(screen.queryByRole("group", { name: "竖向放大" })).toBeNull();
  });
});
