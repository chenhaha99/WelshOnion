// @vitest-environment happy-dom
import { cleanup, createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  blockTitles,
  daysFromOct1,
  openAddBlock,
  openOtherTab,
  openStoredPlan,
  pressedView,
  showView,
  stubNarrowScreen,
} from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 切到时间轴视图，返回「时间轴」卡片。 */
async function timeline(): Promise<HTMLElement> {
  await showView("时间轴");
  return screen.findByRole("region", { name: "时间轴" });
}

/** 横排每一行的标签。 */
async function rowLabels(): Promise<string[]> {
  return within(await timeline())
    .getAllByRole("listitem")
    .map((row) => row.getAttribute("aria-label") ?? "");
}

/** 横排里标签含「 day 」的那一行（比如「10.2」）。 */
async function timelineRow(day: string): Promise<HTMLElement> {
  const rows = await within(await timeline()).findAllByRole("listitem");
  const row = rows.find((item) => item.getAttribute("aria-label")!.includes(` ${day} `));
  if (!row) throw new Error(`时间轴上没有 ${day} 那一行`);
  return row;
}

/** container 里「没排时间」那一串每件的读屏名，按顺序（横排的条在时间轴上面，竖排的在框下面）。 */
function chipNames(container: HTMLElement): string[] {
  return [
    ...within(container).getByRole("group", { name: "没排时间" }).querySelectorAll("[data-undated-chip] > button"),
  ].map((button) => button.getAttribute("aria-label") ?? "");
}

async function pressFilter(user: User, name: string): Promise<void> {
  await user.click(within(await screen.findByRole("group", { name: "按状态筛选" })).getByRole("button", { name }));
}

/** 在 container 里点「这天的操作」，再点菜单里的 item。 */
async function chooseDayMenu(user: User, container: HTMLElement, item: string): Promise<void> {
  await user.click(within(container).getByRole("button", { name: "这天的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: item }));
}

describe("在时间轴上加一件事", () => {
  it("横排：点第一列的「＋」连着加两件，焦点留在框里", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const add = (await openAddBlock(user, await timelineRow("10.2"))) as HTMLInputElement;
    await user.type(add, "西湖{Enter}");
    await user.type(add, "灵隐寺{Enter}");

    await waitFor(async () => expect(chipNames(await timeline())).toEqual(["西湖 10.2 整天", "灵隐寺 10.2 整天"]));
    expect(document.activeElement).toBe(add);
    expect(add.value).toBe("");
    expect(pressedView()).toBe("时间轴");
    expect(await blockTitles("10.2")).toEqual(["西湖", "灵隐寺"]);
  });

  it("按 Esc 关掉输入框，焦点回到「＋」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const row = await timelineRow("10.1");

    await openAddBlock(user, row);
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "加一件事" })).toBeNull());
    expect(document.activeElement).toBe(within(row).getByRole("button", { name: "加一件事" }));
  });

  it("加的被筛掉了：框下面写一句；松开筛选就不写", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", statusId: "confirmed", title: "西湖", minute: 540, duration: 180 });
    });
    await pressFilter(user, "已确认");

    const row = await timelineRow("10.1");
    await user.type(await openAddBlock(user, row), "宋城{Enter}");
    const panel = screen.getByRole("dialog", { name: "加一件事" });

    await waitFor(() => expect(within(panel).getByText("刚加的「宋城」被筛掉了")).toBeTruthy());
    expect(screen.queryByRole("group", { name: "没排时间" })).toBeNull();

    // 松开筛选：条上就有它了（点筛选时输入框当「点外面」收起来，那一句跟着没了）
    await pressFilter(user, "已确认");
    await waitFor(async () => expect(chipNames(await timeline())).toEqual(["宋城 10.1 整天"]));
    expect(screen.queryByText("刚加的「宋城」被筛掉了")).toBeNull();
  });

  it("竖排：框下面加到正在看的这一天", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const region = await timeline();
    await user.click(within(region).getByRole("button", { name: "后一天" }));
    await waitFor(() => expect(region.querySelector("[data-timeline-day]")?.textContent).toBe("第 2 天 · 10.2 周五"));
    expect(within(region).queryByRole("group", { name: "没排时间" })).toBeNull();

    await user.type(within(region).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");

    await waitFor(() => expect(chipNames(region)).toEqual(["河坊街 整天"]));
    expect(await blockTitles("10.2")).toEqual(["河坊街"]);
  });

  it("手指按住「加一件事」的框：不拦系统的长按菜单（粘贴要用）", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const add = await openAddBlock(user, await timelineRow("10.1"));

    fireEvent.pointerDown(add, { pointerType: "touch" });
    const menu = createEvent.contextMenu(add);
    fireEvent(add, menu);

    expect(menu.defaultPrevented).toBe(false);
  });
});

describe("时间轴上每天的菜单", () => {
  it("横排：在下面插一天，还是时间轴视图", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    await chooseDayMenu(user, await timelineRow("10.1"), "在下面插一天");

    await waitFor(async () =>
      expect(await rowLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五", "第 3 天 · 10.3 周六"]),
    );
    expect(pressedView()).toBe("时间轴");
  });

  it("横排：改时区在这一行下面展开，选完焦点回到这一行的「这天的操作」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await chooseDayMenu(user, await timelineRow("10.3"), "改时区…");
    await user.selectOptions(within(await timelineRow("10.3")).getByRole("combobox", { name: "时区" }), "Asia/Tokyo");

    await waitFor(async () => expect((await rowLabels())[2]).toBe("第 3 天 · 10.3 周六 · 东京 +1h"));
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await timelineRow("10.3")).getByRole("button", { name: "这天的操作" })),
    );
  });

  it("横排：插天时被块跨过先问，选「之后」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", minute: 1320, duration: 240 });
    });

    const row = await timelineRow("10.1");
    await chooseDayMenu(user, row, "在下面插一天");
    expect(within(row).getByText("有事跨过这里，它们放在新插入那天的之前还是之后？")).toBeTruthy();
    await user.click(within(row).getByRole("button", { name: "之后" }));

    await waitFor(async () => expect(await rowLabels()).toHaveLength(3));
    expect(await blockTitles("10.2")).toEqual(["民宿"]);
  });

  it("横排：删一天，撤销后焦点到回来那一行的「这天的操作」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [, oct2] = daysFromOct1(plan, 3);
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "乌镇", slot: "day" });
    });

    await chooseDayMenu(user, await timelineRow("10.2"), "删除这天");

    await waitFor(async () => expect(await rowLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.3 周六"]));
    const notice = screen.getByRole("status", { name: "删完的提示" });
    expect(within(notice).getByText("删掉了第 2 天 · 10.2 周五，连同这天的 1 件事")).toBeTruthy();
    await user.click(within(notice).getByRole("button", { name: "撤销" }));

    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await timelineRow("10.2")).getByRole("button", { name: "这天的操作" })),
    );
  });

  it("竖排：这天的时间预算在标签下面展开，收起后焦点回到「这天的操作」", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => daysFromOct1(plan, 2));
    const other = await openOtherTab(planId);

    const region = await timeline();
    await chooseDayMenu(user, region, "这天的时间预算…");
    const budget = within(region).getByRole("group", { name: "第 1 天 · 10.1 周四 的时间预算" });
    await user.type(within(budget).getByLabelText("最多开多远（公里）"), "300{Enter}");
    await user.click(within(budget).getByRole("button", { name: "收起" }));

    await waitFor(() => expect(other.plan().bases[0]!.day_budget).toEqual({ max_drive_km: 300 }));
    expect(within(region).queryByRole("group", { name: "第 1 天 · 10.1 周四 的时间预算" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(region).getByRole("button", { name: "这天的操作" })));
  });
});
