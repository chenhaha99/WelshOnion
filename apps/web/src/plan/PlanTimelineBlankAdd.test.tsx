// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockTexts, daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  await releaseAll();
});

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1、10.2 两天，10.1 有「西湖」09:00 起 3 小时（横轴折起成 07:00–21:00）；more 里再放别的。 */
function lakePlan(more?: (plan: Y.Doc, library: Y.Doc, days: string[]) => void) {
  return (plan: Y.Doc, library: Y.Doc) => {
    const days = daysFromOct1(plan, 2);
    block(plan, library, { baseId: days[0]!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    more?.(plan, library, days);
  };
}

/**
 * 横排：量到的位置写死。每行横轴宽 888、左边在 0：两头折起的那一截各 24 像素，展开的 07:00–21:00 一分钟一像素；
 * 第 1 行从 y=0 到 40，第 2 行从 y=50 到 90。
 */
async function wideTimeline(): Promise<HTMLElement> {
  await showView("时间线");
  const region = await screen.findByRole("region", { name: "时间线" });
  const rows = within(region).getAllByRole("listitem");
  rows.forEach((row, index) => {
    const top = index * 50;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: top, width: 1000, height: 45 }));
    const axis = row.querySelector<HTMLElement>("[data-timeline-axis]")!;
    vi.spyOn(axis, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: top, width: 888, height: 40 }));
  });
  return region;
}

/** 横排第 row 行（从 0 数）、07:00–21:00 里的某个钟点，在屏幕上的位置。 */
function wideSpot(row: number, minute: number): { clientX: number; clientY: number } {
  return { clientX: 24 + (minute - 420), clientY: row * 50 + 20 };
}

function axisOf(region: HTMLElement, row: number): HTMLElement {
  return region.querySelectorAll<HTMLElement>("[data-timeline-axis]")[row]!;
}

/** 用鼠标在 target 上按下、（挪到 to）、松开。 */
function mousePress(target: HTMLElement, at: { clientX: number; clientY: number }, to = at): void {
  fireEvent.pointerDown(target, { ...at, pointerType: "mouse", pointerId: 1, button: 0 });
  if (to !== at) fireEvent.pointerMove(window, { ...to, pointerType: "mouse", pointerId: 1 });
  fireEvent.pointerUp(window, { ...to, pointerType: "mouse", pointerId: 1 });
}

function addCard(): HTMLElement | null {
  return screen.queryByRole("dialog", { name: "加一件事" });
}

describe("电脑上点空白处加一件事", () => {
  it("点一下：画 1 小时，弹框写着哪天几点；回车建出来、选中它", async () => {
    await openStoredPlan(lakePlan());
    const user = userEvent.setup();
    const region = await wideTimeline();

    mousePress(axisOf(region, 0), wideSpot(0, 850));

    const card = await screen.findByRole("dialog", { name: "加一件事" });
    expect(within(card).getByText("第 1 天 · 10.1 周四 · 14:00–15:00")).toBeTruthy();
    const ghost = axisOf(region, 0).querySelector<HTMLElement>("[data-new-range]")!;
    expect(ghost.textContent).toBe("14:00–15:00");
    const input = within(card).getByRole("textbox", { name: "加一件事" });
    await waitFor(() => expect(document.activeElement).toBe(input));

    await user.type(input, "午饭{Enter}");

    await waitFor(() => expect(addCard()).toBeNull());
    const lunch = await within(region).findByRole("button", { name: "午饭 14:00–15:00" });
    expect(lunch.getAttribute("aria-pressed")).toBe("true");
    expect(axisOf(region, 0).querySelector("[data-new-range]")).toBeNull();
    expect(await blockTexts("10.1")).toContainEqual({ title: "午饭", time: "14:00–15:00" });
  });

  it("Esc：框和虚线框都没了，什么都不建", async () => {
    await openStoredPlan(lakePlan());
    const user = userEvent.setup();
    const region = await wideTimeline();

    mousePress(axisOf(region, 0), wideSpot(0, 850));
    await screen.findByRole("dialog", { name: "加一件事" });
    await user.keyboard("{Escape}");

    await waitFor(() => expect(addCard()).toBeNull());
    expect(axisOf(region, 0).querySelector("[data-new-range]")).toBeNull();
    expect(region.querySelectorAll("[data-segment]")).toHaveLength(1);
  });

  it("拖出一段：往左拖，两头取到 15 分钟", async () => {
    await openStoredPlan(lakePlan());
    const region = await wideTimeline();

    mousePress(axisOf(region, 0), wideSpot(0, 1040), wideSpot(0, 905));

    const card = await screen.findByRole("dialog", { name: "加一件事" });
    expect(within(card).getByText("第 1 天 · 10.1 周四 · 15:00–17:30")).toBeTruthy();
  });

  it("有事选中着：点空白只取消选中；再点一次才弹", async () => {
    await openStoredPlan(lakePlan());
    const user = userEvent.setup();
    const region = await wideTimeline();
    await user.click(within(region).getByRole("button", { name: /^西湖 / }));
    expect(within(region).getByRole("button", { name: /^西湖 / }).getAttribute("aria-pressed")).toBe("true");

    mousePress(axisOf(region, 0), wideSpot(0, 850));

    await waitFor(() =>
      expect(within(region).getByRole("button", { name: /^西湖 / }).getAttribute("aria-pressed")).toBe("false"),
    );
    expect(addCard()).toBeNull();

    mousePress(axisOf(region, 0), wideSpot(0, 850));
    expect(await screen.findByRole("dialog", { name: "加一件事" })).toBeTruthy();
  });

  it("按在事上、折起的那一截上：不弹", async () => {
    await openStoredPlan(lakePlan());
    const region = await wideTimeline();

    const lake = region.querySelector<HTMLElement>("[data-segment]")!;
    mousePress(lake, wideSpot(0, 600));
    const fold = axisOf(region, 0).querySelector<HTMLElement>("[data-fold]")!;
    mousePress(fold, { clientX: 10, clientY: 20 });

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(addCard()).toBeNull();
  });

  it("建出来被筛掉：框不关，写一句", async () => {
    // 10.2 另放没排时间的住宿、餐饮各一件：按下这两个类型，新加的还是游玩，被筛掉
    await openStoredPlan(
      lakePlan((plan, library, days) => {
        block(plan, library, { baseId: days[1]!, kindId: "lodging", title: "民宿", slot: "day" });
        block(plan, library, { baseId: days[1]!, kindId: "food", title: "晚饭", slot: "day" });
      }),
    );
    const user = userEvent.setup();
    const kinds = await screen.findByRole("group", { name: "按类型筛选" });
    await user.click(within(kinds).getByRole("button", { name: "住宿" }));
    await user.click(within(kinds).getByRole("button", { name: "餐饮" }));
    const region = await wideTimeline();

    mousePress(axisOf(region, 0), wideSpot(0, 850));
    const card = await screen.findByRole("dialog", { name: "加一件事" });
    await user.type(within(card).getByRole("textbox", { name: "加一件事" }), "宋城{Enter}");

    expect(await within(card).findByText("刚加的「宋城」被筛掉了")).toBeTruthy();
    expect((within(card).getByRole("textbox", { name: "加一件事" }) as HTMLInputElement).value).toBe("");
    expect(within(region).queryByRole("button", { name: /^宋城 / })).toBeNull();
  });
});

describe("手机上按住空白处加一件事", () => {
  /**
   * 竖排：能上下滚的框占屏幕 0–768；框里的竖轴高 1440、一分钟一像素，滚到 14:10 在 y=400 处
   * （指针离框边远，拖到框边框自己滚的那一套不动）。
   */
  async function dayTimeline(): Promise<HTMLElement> {
    await showView("时间线");
    const region = await screen.findByRole("region", { name: "时间线" });
    const scroller = region.querySelector<HTMLElement>("[data-day-scroll]")!;
    vi.spyOn(scroller, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: 0, width: 320, height: 768 }));
    const axis = region.querySelector<HTMLElement>("[data-day-axis]")!;
    vi.spyOn(axis, "getBoundingClientRect").mockReturnValue(DOMRect.fromRect({ x: 0, y: -450, width: 300, height: 1440 }));
    return axis;
  }

  it("按住 0.5 秒：画 1 小时，抬起弹框", async () => {
    stubNarrowScreen();
    await openStoredPlan(lakePlan());
    const axis = await dayTimeline();

    fireEvent.pointerDown(axis, { clientX: 150, clientY: 400, pointerType: "touch", pointerId: 7 });
    await waitFor(() => expect(axis.querySelector("[data-new-range]")?.textContent).toBe("14:00–15:00"), { timeout: 1500 });
    fireEvent.pointerUp(window, { clientX: 150, clientY: 400, pointerType: "touch", pointerId: 7 });

    const card = await screen.findByRole("dialog", { name: "加一件事" });
    expect(within(card).getByText("第 1 天 · 10.1 周四 · 14:00–15:00")).toBeTruthy();
    // 手机上从底部浮起，后面压着暗底
    expect(card.dataset.sheet).toBe("true");
    expect(document.querySelector("[data-card-backdrop]")).not.toBeNull();
  });

  it("轻点：不弹", async () => {
    stubNarrowScreen();
    await openStoredPlan(lakePlan());
    const axis = await dayTimeline();

    fireEvent.pointerDown(axis, { clientX: 150, clientY: 400, pointerType: "touch", pointerId: 8 });
    fireEvent.pointerUp(window, { clientX: 150, clientY: 400, pointerType: "touch", pointerId: 8 });

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(addCard()).toBeNull();
    expect(axis.querySelector("[data-new-range]")).toBeNull();
  });
});
