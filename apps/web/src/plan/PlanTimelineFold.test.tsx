// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockMark, type AddBlockInput } from "@welshonion/core";
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

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1、10.2 两天，10.1 有「西湖」09:00 起 3 小时；more 里再放别的。 */
function lakePlan(more?: (plan: Y.Doc, library: Y.Doc, days: string[]) => void) {
  return (plan: Y.Doc, library: Y.Doc) => {
    const days = daysFromOct1(plan, 2);
    block(plan, library, { baseId: days[0]!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    more?.(plan, library, days);
  };
}

async function timeline(): Promise<HTMLElement> {
  await showView("时间线");
  return screen.findByRole("region", { name: "时间线" });
}

function ticks(region: HTMLElement): string[] {
  return [...region.querySelectorAll("[data-hour-tick]")].map((tick) => tick.textContent ?? "");
}

/** 每一行横轴展开的那段：「从-到」（分钟）。 */
function windows(region: HTMLElement): string[] {
  return [...region.querySelectorAll<HTMLElement>("[data-timeline-axis]")].map(
    (axis) => `${axis.dataset.windowFrom}-${axis.dataset.windowTo}`,
  );
}

/** 折起的那几截：刻度那一行和每一行各自的，写成「before」「after」。 */
function folds(region: HTMLElement): string[] {
  return [...region.querySelectorAll<HTMLElement>("[data-fold]")].map((fold) => fold.dataset.fold!);
}

function fullDayButton(): HTMLElement {
  return screen.getByRole("button", { name: "0–24 点" });
}

describe("没事的凌晨和深夜默认折起", () => {
  it("默认折起：刻度 7……21，刻度那一行和每一行两头各一截", async () => {
    await openStoredPlan(lakePlan());

    const region = await timeline();
    expect(ticks(region)).toEqual(["7", "8", "10", "12", "14", "16", "18", "20", "21"]);
    expect(windows(region)).toEqual(["420-1260", "420-1260"]);
    expect(folds(region)).toEqual(["before", "after", "before", "after", "before", "after"]);
    expect(fullDayButton().getAttribute("aria-pressed")).toBe("false");
    // 「西湖」照折起后的比例画：不再是按 1440 平分的 37.5%
    const lake = within(region).getByRole("button", { name: /^西湖 / }).closest<HTMLElement>("[data-segment]")!;
    expect(lake.style.left).not.toBe("37.5%");
  });

  it("早班机不折：每一行都从 5 点画起，左边折起的是 0–5 点", async () => {
    await openStoredPlan(
      lakePlan((plan, library, days) =>
        block(plan, library, { baseId: days[1]!, kindId: "transit", title: "航班", minute: 340, duration: 120 }),
      ),
    );

    const region = await timeline();
    expect(windows(region)).toEqual(["300-1260", "300-1260"]);
    expect(ticks(region)[0]).toBe("5");
    expect(folds(region)).toHaveLength(6);
    expect(region.querySelector<HTMLElement>('[data-fold="before"]')!.title).toBe("展开 0–5 点");
  });

  it("住宿伸进折起的那一截不展开，两段都画着", async () => {
    await openStoredPlan(
      lakePlan((plan, library, days) =>
        block(plan, library, { baseId: days[0]!, kindId: "lodging", title: "民宿", minute: 900, duration: 1080 }),
      ),
    );

    const region = await timeline();
    expect(windows(region)).toEqual(["420-1260", "420-1260"]);
    const inn = [...region.querySelectorAll<HTMLElement>("[data-segment]")]
      .filter((segment) => within(segment).queryByRole("button", { name: /^民宿 / }))
      .map((segment) => `${segment.dataset.from}-${segment.dataset.to}`);
    expect(inn).toEqual(["900-1440", "0-540"]);
  });

  it("整个在夜里的停留：横轴画到 23 点", async () => {
    await openStoredPlan(
      lakePlan((plan, library, days) =>
        block(plan, library, { baseId: days[0]!, kindId: "stay", title: "看夜景", minute: 1320, duration: 60 }),
      ),
    );

    expect(windows(await timeline())).toEqual(["420-1380", "420-1380"]);
  });

  it("筛选不改变画哪几个钟点", async () => {
    await openStoredPlan(
      lakePlan((plan, library, days) => {
        const flight = block(plan, library, { baseId: days[1]!, kindId: "transit", title: "航班", minute: 340, duration: 120 });
        setBlockMark(plan, [flight], "done");
      }),
    );
    const user = userEvent.setup();
    const region = await timeline();

    await user.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => expect(within(region).queryByRole("button", { name: /^航班 / })).toBeNull());
    expect(windows(region)).toEqual(["300-1260", "300-1260"]);
  });

  it("点折起的那一截：0–24 点；记在这台设备上；再点按钮又折起", async () => {
    const planId = await openStoredPlan(lakePlan());
    const user = userEvent.setup();
    const region = await timeline();

    await user.click(region.querySelectorAll<HTMLElement>("[data-timeline-axis] [data-fold]")[0]!);

    expect(fullDayButton().getAttribute("aria-pressed")).toBe("true");
    expect(ticks(region)).toEqual(["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"]);
    expect(folds(region)).toEqual([]);
    const lake = within(region).getByRole("button", { name: /^西湖 / }).closest<HTMLElement>("[data-segment]")!;
    expect(lake.style.left).toBe("37.5%");

    cleanup();
    renderApp(`#/plans/${planId}`);
    const again = await screen.findByRole("region", { name: "时间线" });
    expect(ticks(again)[0]).toBe("0");
    expect(fullDayButton().getAttribute("aria-pressed")).toBe("true");

    await user.click(fullDayButton());
    expect(fullDayButton().getAttribute("aria-pressed")).toBe("false");
    expect(ticks(again)[0]).toBe("7");
  });

  it("刻度那一行的折起那一截也能点；另一个计划还是折起的", async () => {
    await openStoredPlan(lakePlan());
    const user = userEvent.setup();
    const region = await timeline();
    const headerFold = [...region.querySelectorAll<HTMLElement>("[data-fold]")].find(
      (fold) => fold.closest("[data-timeline-axis]") === null,
    )!;

    await user.click(headerFold);
    expect(fullDayButton().getAttribute("aria-pressed")).toBe("true");

    cleanup();
    await openStoredPlan(lakePlan());
    await timeline();
    expect(fullDayButton().getAttribute("aria-pressed")).toBe("false");
  });

  it("不折也画得下：按不了，没有折起的那一截", async () => {
    await openStoredPlan((plan, library) => {
      const days = daysFromOct1(plan, 2);
      block(plan, library, { baseId: days[0]!, kindId: "transit", title: "夜车", minute: 1200, duration: 720 });
    });

    const region = await timeline();
    expect(windows(region)).toEqual(["0-1440", "0-1440"]);
    expect(folds(region)).toEqual([]);
    expect((fullDayButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("手机上不折，没有「0–24 点」", async () => {
    stubNarrowScreen();
    await openStoredPlan(lakePlan());

    const region = await timeline();
    expect(region.querySelectorAll("[data-hour-tick]")).toHaveLength(13);
    expect(folds(region)).toEqual([]);
    expect(screen.queryByRole("button", { name: "0–24 点" })).toBeNull();
  });
});
