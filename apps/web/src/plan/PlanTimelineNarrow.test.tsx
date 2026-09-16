// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 时间轴上读屏名以「title 」开头的那一段里，标题那一小段。 */
async function titleOf(title: string): Promise<HTMLElement | null> {
  const timeline = await screen.findByRole("region", { name: "时间轴" });
  return within(timeline)
    .getByRole("button", { name: new RegExp(`^${title} `) })
    .querySelector<HTMLElement>("[data-bar-title]");
}

/** 横轴那一层的最小宽度（放大改的就是它）。 */
function axisWidth(): string {
  return document.querySelector<HTMLElement>("[data-timeline-scroll] > div")!.style.minWidth;
}

/** 卡片上的横向放大拖动条。 */
function zoomSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "横向放大" }) as HTMLInputElement;
}

describe("标题写不下时借右边的空白", () => {
  it("右边空着借到下一件；右边没有下一件借到 24 点", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
      block(plan, library, { baseId: day!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    });
    await showView("时间轴");

    // 西湖 60 分钟 + 借 120 分钟 = 自己的 3 倍；午饭 60 分钟 + 借到 24 点的 660 分钟 = 12 倍
    expect((await titleOf("西湖"))?.style.maxWidth).toBe("300%");
    expect((await titleOf("午饭"))?.style.maxWidth).toBe("1200%");
  });

  it("右边紧挨着下一件就借不到", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
      block(plan, library, { baseId: day!, kindId: "sight", title: "灵隐寺", minute: 600, duration: 60 });
    });
    await showView("时间轴");

    expect((await titleOf("西湖"))?.style.maxWidth).toBe("100%");
  });

  it("时长为 0 的竖线不写标题", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "看潮", minute: 720, duration: 0 });
    });
    await showView("时间轴");

    expect(await titleOf("看潮")).toBeNull();
  });
});

describe("时间轴横向放大", () => {
  it("拖动条无级放大：横轴跟着变宽，100% 到 400%", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    const slider = zoomSlider();
    expect(slider.value).toBe("100");
    expect(slider.min).toBe("100");
    expect(slider.max).toBe("400");
    expect(screen.getByText("100%")).toBeTruthy();
    expect(axisWidth()).toBe("62rem");

    fireEvent.change(slider, { target: { value: "170" } });

    await waitFor(() => expect(screen.getByText("170%")).toBeTruthy());
    expect(axisWidth()).toBe("105.4rem");
  });

  it("记在这台设备上：切走再回来还是那个倍数", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    fireEvent.change(zoomSlider(), { target: { value: "200" } });
    await showView("列表");
    await showView("时间轴");

    await waitFor(() => expect(zoomSlider().value).toBe("200"));
    expect(axisWidth()).toBe("124rem");
  });

  it("手机上没有拖动条", async () => {
    stubNarrowScreen();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    expect(screen.queryByRole("slider", { name: "横向放大" })).toBeNull();
  });
});
