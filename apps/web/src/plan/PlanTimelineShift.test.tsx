// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

const SHIFT = "这天从这件起往后推迟";

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1：西湖 09:00 起 3 小时、午饭 12:00 起 1 小时、灵隐寺 14:00 起 2 小时；confirmed 里的是已确认，其余待定。 */
function threeThings(plan: Y.Doc, library: Y.Doc, confirmed: readonly string[] = []): void {
  const [oct1] = daysFromOct1(plan, 1);
  const things = [
    ["西湖", 540, 180],
    ["午饭", 720, 60],
    ["灵隐寺", 840, 120],
  ] as const;
  for (const [title, minute, duration] of things) {
    const statusId = confirmed.includes(title) ? "confirmed" : "pending";
    block(plan, library, { baseId: oct1!, kindId: "sight", statusId, title, minute, duration });
  }
}

/** 切到时间轴视图，返回「时间轴」卡片。 */
async function timeline(): Promise<HTMLElement> {
  await showView("时间轴");
  return screen.findByRole("region", { name: "时间轴" });
}

/** 横排里「第 1 天 · 10.1 周四」这样的一行。 */
async function timelineRow(day: string): Promise<HTMLElement> {
  const rows = await within(await timeline()).findAllByRole("listitem");
  const row = rows.find((item) => item.getAttribute("aria-label")!.includes(` ${day} `));
  if (!row) throw new Error(`时间轴上没有 ${day} 那一行`);
  return row;
}

function segmentOf(container: HTMLElement, title: string): HTMLElement {
  return within(container).getByRole("button", { name: new RegExp(`^${title} `) }).closest<HTMLElement>("[data-segment]")!;
}

/** 点开 title 的详情，在「这天从这件起往后推迟」里点 choice。 */
async function shiftFrom(user: User, container: HTMLElement, title: string, choice: string): Promise<void> {
  await user.click(await within(container).findByRole("button", { name: new RegExp(`^${title} `) }));
  const dialog = screen.getByRole("dialog", { name: title });
  await user.click(within(within(dialog).getByRole("group", { name: SHIFT })).getByRole("button", { name: choice }));
}

async function pressFilter(user: User, name: string): Promise<void> {
  await user.click(within(await screen.findByRole("group", { name: "按状态筛选" })).getByRole("button", { name }));
}

describe("详情里推迟这天后面的安排", () => {
  it("推迟 30 分钟：这件和后面的挪了，前面的不动；详情关掉，焦点回到横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => threeThings(plan, library));
    const row = await timelineRow("10.1");

    await shiftFrom(user, row, "午饭", "30 分钟");

    await waitFor(() => expect(segmentOf(row, "午饭").dataset).toMatchObject({ from: "750", to: "810" }));
    expect(segmentOf(row, "灵隐寺").dataset).toMatchObject({ from: "870", to: "990" });
    expect(segmentOf(row, "西湖").dataset).toMatchObject({ from: "540", to: "720" });
    expect(screen.queryByRole("dialog", { name: "午饭" })).toBeNull();
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: /^午饭 / }));
  });

  it("一步撤销：推迟的全回来", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => threeThings(plan, library));
    const row = await timelineRow("10.1");
    await shiftFrom(user, row, "午饭", "30 分钟");
    await waitFor(() => expect(segmentOf(row, "午饭").dataset.from).toBe("750"));

    await user.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(() => expect(segmentOf(row, "午饭").dataset.from).toBe("720"));
    expect(segmentOf(row, "灵隐寺").dataset.from).toBe("840");
  });

  it("被「只看」筛掉的也一起挪", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => threeThings(plan, library, ["西湖", "午饭"]));
    await pressFilter(user, "已确认");
    const row = await timelineRow("10.1");
    await waitFor(() => expect(within(row).queryByRole("button", { name: /^灵隐寺 / })).toBeNull());

    await shiftFrom(user, row, "午饭", "30 分钟");
    await waitFor(() => expect(segmentOf(row, "午饭").dataset.from).toBe("750"));
    await pressFilter(user, "已确认");

    await waitFor(() => expect(segmentOf(row, "灵隐寺").dataset.from).toBe("870"));
  });

  it("推过 24 点：换到下一行", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "夜游", minute: 1410, duration: 60 });
    });
    const oct1Row = await timelineRow("10.1");

    await shiftFrom(user, oct1Row, "夜游", "1 小时");

    await waitFor(() => expect(within(oct1Row).queryByRole("button", { name: /^夜游 / })).toBeNull());
    expect(segmentOf(await timelineRow("10.2"), "夜游").dataset).toMatchObject({ from: "30", to: "90" });
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await timelineRow("10.2")).getByRole("button", { name: /^夜游 / })),
    );
  });

  it("横条的详情里有这一组，「没排时间」栏里的事没有", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" });
    });
    const row = await timelineRow("10.1");

    await user.click(within(row).getByRole("button", { name: /^西湖 / }));
    const lake = screen.getByRole("dialog", { name: "西湖" });
    const choices = within(within(lake).getByRole("group", { name: SHIFT })).getAllByRole("button");
    expect(choices.map((choice) => choice.textContent)).toEqual(["15 分钟", "30 分钟", "1 小时"]);
    await user.keyboard("{Escape}");

    await user.click(within(within(row).getByRole("group", { name: "没排时间" })).getByRole("button", { name: /^河坊街 / }));
    const street = screen.getByRole("dialog", { name: "河坊街" });
    expect(within(street).queryByRole("group", { name: SHIFT })).toBeNull();
  });

  it("列表里的「详情…」也能推迟：面板关掉，焦点回到行菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => threeThings(plan, library));

    await user.click(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "详情…" }));
    const dialog = screen.getByRole("dialog", { name: "午饭" });
    await user.click(within(within(dialog).getByRole("group", { name: SHIFT })).getByRole("button", { name: "30 分钟" }));

    await waitFor(async () =>
      expect(await blockTexts("10.1")).toEqual([
        { title: "西湖", time: "09:00–12:00" },
        { title: "午饭", time: "12:30–13:30" },
        { title: "灵隐寺", time: "14:30–16:30" },
      ]),
    );
    expect(screen.queryByRole("dialog", { name: "午饭" })).toBeNull();
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "这件事的操作" })),
    );
  });
});

describe("窄屏", () => {
  beforeEach(() => stubNarrowScreen());

  it("竖条点开也能推迟", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => threeThings(plan, library));
    const region = await timeline();

    await shiftFrom(user, region, "午饭", "1 小时");

    await waitFor(() => expect(segmentOf(region, "午饭").dataset).toMatchObject({ from: "780", to: "840" }));
    expect(segmentOf(region, "灵隐寺").dataset).toMatchObject({ from: "900", to: "1020" });
    expect(segmentOf(region, "西湖").dataset).toMatchObject({ from: "540", to: "720" });
  });
});
