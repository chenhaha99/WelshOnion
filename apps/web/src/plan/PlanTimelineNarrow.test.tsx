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

/** 时间线上读屏名以「title 」开头的那一段里，标题那一小段。 */
async function titleOf(title: string): Promise<HTMLElement | null> {
  const timeline = await screen.findByRole("region", { name: "时间线" });
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

describe("标题写不下就截断，不写到块外面", () => {
  it("标题那一段没有伸出去用的 max-width", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "西湖漫步", minute: 540, duration: 60 });
      block(plan, library, { baseId: day!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    });
    await showView("时间线");

    expect((await titleOf("西湖漫步"))?.style.maxWidth).toBe("");
    expect((await titleOf("午饭"))?.style.maxWidth).toBe("");
  });

  it("鼠标停在块上有提示，写「标题 时间」", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "西湖漫步", minute: 540, duration: 60 });
    });
    await showView("时间线");

    const timeline = await screen.findByRole("region", { name: "时间线" });
    const bar = within(timeline).getByRole("button", { name: /^西湖漫步 / });
    expect(bar.getAttribute("title")).toBe("西湖漫步 09:00–10:00");
  });

  it("时长为 0 的竖线不写标题", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "看潮", minute: 720, duration: 0 });
    });
    await showView("时间线");

    expect(await titleOf("看潮")).toBeNull();
  });
});

describe("时间线横向放大", () => {
  it("拖动条无级放大：横轴跟着变宽，100% 到 400%", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间线");

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
    await showView("时间线");

    fireEvent.change(zoomSlider(), { target: { value: "200" } });
    await showView("日程");
    await showView("时间线");

    await waitFor(() => expect(zoomSlider().value).toBe("200"));
    expect(axisWidth()).toBe("124rem");
  });

  it("手机上没有拖动条", async () => {
    stubNarrowScreen();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间线");

    expect(screen.queryByRole("slider", { name: "横向放大" })).toBeNull();
  });
});
