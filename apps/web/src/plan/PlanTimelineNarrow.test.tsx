// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
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

function zoomGroup(): HTMLElement {
  return screen.getByRole("group", { name: "横向放大" });
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
  it("＋ 一档一档放大，到头不能点，横轴跟着变宽", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    expect(within(zoomGroup()).getByText("100%")).toBeTruthy();
    expect(within(zoomGroup()).getByRole("button", { name: "缩小" })).toHaveProperty("disabled", true);
    expect(axisWidth()).toBe("62rem");

    await user.click(within(zoomGroup()).getByRole("button", { name: "放大" }));
    expect(within(zoomGroup()).getByText("150%")).toBeTruthy();
    expect(axisWidth()).toBe("93rem");

    await user.click(within(zoomGroup()).getByRole("button", { name: "放大" }));
    await user.click(within(zoomGroup()).getByRole("button", { name: "放大" }));
    expect(within(zoomGroup()).getByText("300%")).toBeTruthy();
    expect(axisWidth()).toBe("186rem");
    expect(within(zoomGroup()).getByRole("button", { name: "放大" })).toHaveProperty("disabled", true);
  });

  it("记在这台设备上：切走再回来还是那个倍数", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    await user.click(within(zoomGroup()).getByRole("button", { name: "放大" }));
    await showView("列表");
    await showView("时间轴");

    await waitFor(() => expect(within(zoomGroup()).getByText("150%")).toBeTruthy());
    expect(axisWidth()).toBe("93rem");
  });

  it("手机上没有这一组", async () => {
    stubNarrowScreen();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");

    expect(screen.queryByRole("group", { name: "横向放大" })).toBeNull();
  });
});
