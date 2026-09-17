// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openDetails, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

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

async function lakeOnTimeline(): Promise<HTMLElement> {
  await showView("时间轴");
  const region = await screen.findByRole("region", { name: "时间轴" });
  return waitFor(() => within(region).getByRole("button", { name: /^西湖 / }));
}

function backdrop(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-card-backdrop]");
}

describe("手机上详情从底部浮起", () => {
  it("从底部浮起、后面压暗底；点暗底关掉", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await openStoredPlan(lakePlan);

    await openDetails(user, await lakeOnTimeline());

    const dialog = screen.getByRole("dialog", { name: "西湖" });
    expect(dialog.dataset.sheet).toBe("true");
    expect(backdrop()).not.toBeNull();

    await user.click(backdrop()!);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull());
    expect(backdrop()).toBeNull();
    // 同点「关闭」：「西湖」还选中着，快捷条还在
    expect((await lakeOnTimeline()).getAttribute("aria-pressed")).toBe("true");
  });

  it("搜索照旧占满屏幕，没有暗底", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await openStoredPlan(lakePlan);
    await lakeOnTimeline();

    await user.click(screen.getByRole("button", { name: "搜索" }));

    const dialog = await screen.findByRole("dialog", { name: "搜索" });
    expect(dialog.dataset.sheet).toBeUndefined();
    expect(backdrop()).toBeNull();
  });

  it("电脑上不变：贴着按钮的气泡，没有暗底", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakePlan);

    await openDetails(user, await lakeOnTimeline());

    const dialog = screen.getByRole("dialog", { name: "西湖" });
    expect(dialog.dataset.sheet).toBeUndefined();
    expect(backdrop()).toBeNull();
  });
});
