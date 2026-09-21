// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, deleteDay, setDays, type AddBlockInput } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { firstOpenDay } from "./PhoneTimeline";
import { daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

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

/** 一天一行，每行的读屏名：「第 1 天 · 10.1 周四」 */
function dayRows(region: HTMLElement): string[] {
  return within(within(region).getByRole("list", { name: "每天" }))
    .getAllByRole("listitem")
    .map((row) => row.getAttribute("aria-label") ?? "");
}

/** 展开的是哪天；一天都没展开是 null */
function openDay(region: HTMLElement): string | null {
  return region.querySelector("li[data-open]")?.getAttribute("aria-label") ?? null;
}

function segmentsOf(region: HTMLElement, title: string): HTMLElement[] {
  return within(region)
    .getAllByRole("button", { name: new RegExp(`^${title} `) })
    .map((button) => button.closest<HTMLElement>("[data-segment]")!);
}

describe("手机上：一天一条横的，整趟的天堆起来", () => {
  it("所有天都在，一天一行；没有「前一天」「后一天」，也没有「竖向放大」", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    const region = await timeline();

    expect(dayRows(region)).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五", "第 3 天 · 10.3 周六"]);
    expect(within(region).queryByRole("button", { name: "前一天" })).toBeNull();
    expect(within(region).queryByRole("button", { name: "后一天" })).toBeNull();
    expect(screen.queryByRole("group", { name: "竖向放大" })).toBeNull();
    // 手机上的条一个字都不写，「条上写」那组开关也就不要了
    expect(screen.queryByRole("group", { name: "条上写" })).toBeNull();
    expect(screen.queryByRole("slider", { name: "文字行数" })).toBeNull();
  });

  it("色块上一个字都不写；读屏名照样有标题和时间", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    const region = await timeline();
    const button = within(region).getByRole("button", { name: /^西湖 09:00–12:00/ });

    expect(button.textContent).toBe("");
  });

  it("跨午夜的事：第二天那一条也画出延续过来的那一截", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "transit", title: "夜车", minute: 1200, duration: 600 });
    });

    const region = await timeline();
    const [first, second] = segmentsOf(region, "夜车");

    expect(first!.closest("li")!.getAttribute("aria-label")).toBe("第 1 天 · 10.1 周四");
    expect(first!.dataset.continuesAfter).toBe("true");
    expect(second!.closest("li")!.getAttribute("aria-label")).toBe("第 2 天 · 10.2 周五");
    expect(second!.dataset.continuesBefore).toBe("true");
  });

  it("三档标记：色块外面那层带着 data-mark，样子照三档画", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    const region = await timeline();

    expect(segmentsOf(region, "西湖")[0]!.dataset.mark).toBe("decided");
  });
});

describe("第一次打开展开哪天", () => {
  it.each([
    ["还没出发：第一天", ["2026-10-01", "2026-10-02"], 0],
    ["进行中：今天", ["2026-09-13", "2026-09-14", "2026-09-15"], 1],
    ["今天那天被删了：今天之后最近的一天", ["2026-09-13", "2026-09-15"], 1],
    ["已经结束：最后一天", ["2026-09-01", "2026-09-02"], 1],
  ])("%s", (_name, dates, expected) => {
    expect(firstOpenDay(dates.map((date) => ({ date })), "2026-09-14")).toBe(expected);
  });

  it("行程进行中：打开就展开今天那条", async () => {
    await openStoredPlan((plan) => daysFrom(plan, "2026-09-13", 3));

    const region = await timeline();

    await waitFor(() => expect(openDay(region)).toBe("第 2 天 · 9.14 周一"));
  });

  it("今天那天被删了：展开今天之后最近的一天", async () => {
    await openStoredPlan((plan) => {
      const [, sep14] = daysFrom(plan, "2026-09-13", 4);
      if (!deleteDay(plan, sep14!).ok) throw new Error("删天失败");
    });

    const region = await timeline();

    await waitFor(() => expect(openDay(region)).toMatch(/9\.15/));
  });
});

describe("点开哪天看哪天", () => {
  it("点日期展开这天、别的天收起；再点一下收起", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));
    const region = await timeline();
    expect(openDay(region)).toBe("第 1 天 · 10.1 周四");

    await user.click(within(region).getByRole("button", { name: /^第 3 天/ }));
    expect(openDay(region)).toBe("第 3 天 · 10.3 周六");
    expect(within(region).getByRole("button", { name: /^第 1 天/ }).getAttribute("aria-expanded")).toBe("false");

    await user.click(within(region).getByRole("button", { name: /^第 3 天/ }));
    expect(openDay(region)).toBeNull();
  });

  it("切到日程再切回来：还是切走前展开的那天", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));
    await user.click(within(await timeline()).getByRole("button", { name: /^第 2 天/ }));

    await showView("日程");
    const region = await timeline();

    expect(openDay(region)).toBe("第 2 天 · 10.2 周五");
  });
});

describe("一件事都没有", () => {
  it("一天都没展开时点「加第一件事」：先展开第 1 天，焦点到那天的「加一件事」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));
    const region = await timeline();
    await user.click(within(region).getByRole("button", { name: /^第 1 天/ }));
    expect(openDay(region)).toBeNull();

    await user.click(within(region).getByRole("button", { name: "加第一件事" }));

    await waitFor(() => expect(openDay(region)).toBe("第 1 天 · 10.1 周四"));
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toBe("加一件事"));
  });
});

describe("展开的那天", () => {
  it("底下一行写排了多久、还有几件没排时间，旁边是「这天的操作」", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const region = await timeline();
    const open = region.querySelector<HTMLElement>("li[data-open]")!;

    expect(open.textContent).toContain("排了 3 小时 · 还有 1 件没排时间");
    expect(within(open).getByRole("button", { name: "这天的操作" })).toBeTruthy();
  });

  it("底层类型（停留）的标题写在概况最前面：这天在哪", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    const region = await timeline();

    expect(region.querySelector("li[data-open]")!.textContent).toContain("在杭州 · 排了 3 小时");
  });

  it("这天没排时间的那几件列出来，下面能加一件事", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const region = await timeline();
    const open = region.querySelector<HTMLElement>("li[data-open]")!;

    expect(within(open).getByRole("button", { name: /^灵隐寺/ })).toBeTruthy();
    expect(within(open).getByRole("textbox", { name: "加一件事" })).toBeTruthy();
  });

  it("没展开的天行末写这天还有几件没排时间", async () => {
    await openStoredPlan((plan, library) => {
      const [, oct2] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "拙政园", slot: "day" });
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "平江路", slot: "day" });
    });

    const region = await timeline();
    const second = within(region).getAllByRole("listitem")[1]!;

    expect(second.hasAttribute("data-open")).toBe(false);
    expect(within(second).getByTitle("还有 2 件没排时间").textContent).toBe("+2");
  });

  it("点色块：选中那件事，屏幕底部浮出快捷条", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    await user.click(within(await timeline()).getByRole("button", { name: /^西湖 / }));

    expect(await screen.findByRole("toolbar", { name: "「西湖」的操作" })).toBeTruthy();
  });
});
