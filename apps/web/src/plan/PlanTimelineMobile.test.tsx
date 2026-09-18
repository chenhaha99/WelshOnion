// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, deleteDay, setDays, type AddBlockInput } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  dayLabels,
  daysFromOct1,
  openDayMenu,
  openDetails,
  openStoredPlan,
  pressedView,
  showView,
  stubNarrowScreen,
} from "./test-helpers";

// 测试里「现在」是 2026-09-14 18:00（北京），系统时区是北京，见 app/test-render.tsx

beforeEach(() => stubNarrowScreen());

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

function daysFrom(plan: Y.Doc, startDate: string, count: number): string[] {
  const result = setDays(plan, { startDate, count, tz: "Asia/Shanghai" });
  if (!result.ok) throw new Error("建天失败");
  return result.value.baseIds;
}

/** 切到时间线视图，返回「时间线」卡片。 */
async function timeline(): Promise<HTMLElement> {
  await showView("时间线");
  return screen.findByRole("region", { name: "时间线" });
}

/** 竖排现在显示的是哪一天。 */
async function shownDay(): Promise<string> {
  return (await timeline()).querySelector("[data-timeline-day]")?.textContent ?? "";
}

function segmentOf(region: HTMLElement, title: string): HTMLElement {
  return within(region).getByRole("button", { name: new RegExp(`^${title} `) }).closest<HTMLElement>("[data-segment]")!;
}

describe("窄屏上竖着看一天", () => {
  it("一次一天：翻到后一天、最后一天不能再往后", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 1 天 · 10.1 周四"));
    expect(within(region).getByRole("button", { name: "前一天" })).toHaveProperty("disabled", true);
    expect(region.querySelectorAll("[data-hour-tick]")).toHaveLength(13);
    // 横排的一天一行不在了
    expect(within(region).queryAllByRole("listitem")).toHaveLength(0);

    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 2 天 · 10.2 周五");
    expect(within(region).getByRole("button", { name: "前一天" })).toHaveProperty("disabled", false);

    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 3 天 · 10.3 周六");
    expect(within(region).getByRole("button", { name: "后一天" })).toHaveProperty("disabled", true);
  });
});

describe("打开时落在哪一天", () => {
  it("行程进行中：落在今天，没有「回到今天」", async () => {
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-13", 3));
    await waitFor(async () => expect(await shownDay()).toBe("第 2 天 · 9.14 周一"));
    expect(within(await timeline()).queryByRole("button", { name: "回到今天" })).toBeNull();
  });

  it("还没出发：第一天", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 3));
    await waitFor(async () => expect(await shownDay()).toBe("第 1 天 · 10.1 周四"));
  });

  it("已经结束：最后一天", async () => {
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-10", 3));
    await waitFor(async () => expect(await shownDay()).toBe("第 3 天 · 9.12 周六"));
  });

  it("翻走以后「回到今天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-13", 3));
    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 2 天 · 9.14 周一"));

    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 3 天 · 9.15 周二");
    await user.click(within(region).getByRole("button", { name: "回到今天" }));

    expect(await shownDay()).toBe("第 2 天 · 9.14 周一");
    expect(within(region).queryByRole("button", { name: "回到今天" })).toBeNull();
  });

  it("今天那一天被删了：今天之后最近的一天", async () => {
    await openStoredPlan((plan) => {
      const [, today] = daysFrom(plan, "2026-09-13", 3);
      deleteDay(plan, today!);
    });
    await waitFor(async () => expect(await shownDay()).toBe("第 2 天 · 9.15 周二"));
  });

  it("切到日程再切回来：还是切走前看的那天", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-13", 3));
    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 2 天 · 9.14 周一"));
    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 3 天 · 9.15 周二");

    await showView("日程");
    expect(screen.queryByRole("region", { name: "时间线" })).toBeNull();

    expect(await shownDay()).toBe("第 3 天 · 9.15 周二");
  });

  it("在日程里删了前面的一天，切回来还是原来那天", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-13", 4));
    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 2 天 · 9.14 周一"));
    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 3 天 · 9.15 周二");

    await user.click(within(await openDayMenu(user, "9.13")).getByRole("menuitem", { name: "删除这天" }));
    await waitFor(async () => expect(await dayLabels()).toHaveLength(3));

    expect(await shownDay()).toBe("第 2 天 · 9.15 周二");
  });
});

describe("竖条怎么画", () => {
  it("按时长占高度；同时进行的并排成列；点开详情", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "游船", minute: 600, duration: 60 });
    });

    const region = await timeline();
    const lake = await waitFor(() => segmentOf(region, "西湖"));
    expect(lake.dataset).toMatchObject({ from: "540", to: "720", track: "main", lane: "1" });
    expect(lake.style.top).toBe("37.5%");
    expect(lake.style.height).toBe("12.5%");
    expect(segmentOf(region, "游船").dataset.lane).toBe("2");

    await openDetails(user, within(lake).getByRole("button", { name: /^西湖 / }));
    // 气泡里只剩标题、备注这些；时间在快捷条和日程的时间格上
    const dialog = screen.getByRole("dialog", { name: "西湖" });
    expect(within(dialog).getByLabelText("标题")).toHaveProperty("value", "西湖");
  });

  it("跨午夜的块只画落在这一天里的那一段", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", minute: 1320, duration: 600 });
    });

    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 1 天 · 10.1 周四"));
    await user.click(within(region).getByRole("button", { name: "后一天" }));

    await waitFor(() => expect(segmentOf(region, "民宿").dataset).toMatchObject({ from: "0", to: "480", track: "background" }));
  });

  it("竖排下面列出这一天没排时间的事", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "morning", duration: 120 });
    });

    const region = await timeline();
    // 在竖排那个能上下滚的框下面，不是横排每行右边的栏
    const scroller = await waitFor(() => {
      const found = region.querySelector("[data-day-scroll]");
      if (!found) throw new Error("没有竖排的框");
      return found;
    });
    const tray = within(region).getByRole("group", { name: "没排时间" });
    expect(scroller.compareDocumentPosition(tray) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // 竖排没有横排那样的表头，自己写上「没排时间」
    expect(within(region).getByText("没排时间")).toBeTruthy();
    expect(
      within(tray)
        .getAllByRole("button")
        .map((button) => button.getAttribute("aria-label")),
    ).toEqual(["河坊街 整天", "灵隐寺 上午 · 2 小时"]);
  });

  it("这一天没有没排时间的事：下面什么都不出现，翻到有的那天才出现", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [, oct2] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "河坊街", slot: "day" });
    });

    const region = await timeline();
    await waitFor(async () => expect(await shownDay()).toBe("第 1 天 · 10.1 周四"));
    expect(within(region).queryByRole("group", { name: "没排时间" })).toBeNull();
    expect(within(region).queryByText("没排时间")).toBeNull();

    await user.click(within(region).getByRole("button", { name: "后一天" }));
    expect(await shownDay()).toBe("第 2 天 · 10.2 周五");
    const tray = within(region).getByRole("group", { name: "没排时间" });
    expect(within(tray).getByRole("button", { name: "河坊街 整天" })).toBeTruthy();
    expect(within(region).getByText("没排时间")).toBeTruthy();
  });
});

describe("空的时候", () => {
  it("窄屏上一件事都没有：同样写先加事，有「加第一件事」", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const region = await timeline();
    expect(await within(region).findByText("还没有事。加了事、排上时间，就会画在这里")).toBeTruthy();
    expect(within(region).getByRole("button", { name: "加第一件事" })).toBeTruthy();
  });

  it("窄屏上那句话不提右边的栏，也不提拖", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    const region = await timeline();
    expect(await within(region).findByText("排上时间的事会画在这里：点开下面没排时间的事排时间")).toBeTruthy();
    expect(region.textContent).not.toContain("右边");
  });

  it("窄屏上点「加第一件事」：焦点到框下面的「加一件事」，不切视图", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const region = await timeline();
    await user.click(await within(region).findByRole("button", { name: "加第一件事" }));

    expect(pressedView()).toBe("时间线");
    await waitFor(() => expect(document.activeElement).toBe(within(region).getByRole("textbox", { name: "加一件事" })));
  });
});
