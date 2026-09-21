// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, deleteDay, setDays, type AddBlockInput, type PlanView } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import type { MoneyCell } from "./money-cells";
import { firstOpenDay, tagItems, tagText } from "./PhoneTimeline";
import type { RowLayout } from "./timeline-layout";
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
    // 色块上不写字，没有「文字行数」；「条上写」管的是条下面那几行（见下面）
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

describe("条上写：管展开那天条下面那几行写什么", () => {
  const toggle = (label: string) => within(screen.getByRole("group", { name: "条上写" })).getByRole("button", { name: label });

  it("手机上也有这组开关，默认写标题和时长，不写开销", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await timeline();

    expect(toggle("标题").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("时长").getAttribute("aria-pressed")).toBe("true");
    expect(toggle("开销").getAttribute("aria-pressed")).toBe("false");
  });

  // 画出来的字要量条宽，测试环境没有排版：拼字规则在这里测，画出来的样子在 e2e 里量
  describe("拼字规则", () => {
    const plan = { blocks: new Map([["lake", { title: "西湖" }]]) } as unknown as PlanView;
    const cells = (cell?: Partial<MoneyCell>) =>
      new Map(cell ? [["lake", { ownCents: 0, ownCount: 0, unfilledCount: 0, sharedElsewhere: false, otherKinds: false, ...cell }]] : []);
    const all = { title: true, duration: true, money: true };

    it("三样都开：标题 时长 金额；退回时只留第一样", () => {
      expect(tagText(plan, "lake", 180, all, cells({ ownCents: 8000, ownCount: 1 }))).toEqual({ full: "西湖 3 小时 ¥80", short: "西湖" });
    });

    it("只开开销：只写金额", () => {
      expect(tagText(plan, "lake", 180, { title: false, duration: false, money: true }, cells({ ownCents: 8000, ownCount: 1 }))).toEqual({
        full: "¥80",
        short: "¥80",
      });
    });

    it("没填开销的不写「填开销」", () => {
      expect(tagText(plan, "lake", 180, all, cells())).toEqual({ full: "西湖 3 小时", short: "西湖" });
    });

    it("三样都关：不写字（也不画点）", () => {
      expect(tagText(plan, "lake", 180, { title: false, duration: false, money: false }, cells())).toBeNull();
    });
  });
});

describe("批量：手机上「对这 N 件…」在筛选那一行最前面", () => {
  it("类型再多也不用左右滑就看得到", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      for (const [kindId, title] of [["sight", "西湖"], ["food", "午饭"], ["transit", "高铁"], ["stay", "酒店"]] as const) {
        block(plan, library, { baseId: oct1!, kindId, title, slot: "day" });
      }
    });
    await timeline();

    const row = document.querySelector<HTMLElement>("[data-filter-row]")!;
    const first = row.querySelector("button")!;
    expect(first.getAttribute("aria-label") ?? first.textContent).toMatch(/^对这 4 件/);
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

  it("没展开的天：点条上哪儿都是展开这天，点到色块、底色也不选中", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [, oct2] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct2!, kindId: "stay", title: "在苏州", minute: 0, duration: 1440 });
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "拙政园", minute: 540, duration: 180 });
    });
    const region = await timeline();
    expect(openDay(region)).toBe("第 1 天 · 10.1 周四");

    await user.click(within(region).getByRole("button", { name: /^拙政园 / }));

    expect(openDay(region)).toBe("第 2 天 · 10.2 周五");
    expect(screen.queryByRole("toolbar", { name: "「拙政园」的操作" })).toBeNull();

    // 展开以后再点色块才是选中
    await user.click(within(region).getByRole("button", { name: /^拙政园 / }));
    expect(await screen.findByRole("toolbar", { name: "「拙政园」的操作" })).toBeTruthy();

    // 收起后点底色（整条的停留）：也是展开，不选中「在苏州」
    await user.click(within(region).getByRole("button", { name: /^第 2 天/ }));
    await user.click(within(region).getByRole("button", { name: /^在苏州 / }));
    expect(openDay(region)).toBe("第 2 天 · 10.2 周五");
    expect(screen.queryByRole("toolbar", { name: "「在苏州」的操作" })).toBeNull();
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
  it("没有概况那一行；「这天的操作」在「加一件事」同一行的右边", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const region = await timeline();
    const open = region.querySelector<HTMLElement>("li[data-open]")!;

    expect(open.textContent).not.toContain("排了");
    expect(open.textContent).not.toContain("件没排时间");
    const add = within(open).getByRole("textbox", { name: "加一件事" });
    const menu = within(open).getByRole("button", { name: "这天的操作" });
    expect(menu.closest("[data-add-row]")).toBe(add.closest("[data-add-row]"));
    expect(add.closest("[data-add-row]")).not.toBeNull();
  });

  it("底层类型（停留）也排进条下面那几行：只写名字，不写时长", () => {
    const plan = {
      blocks: new Map([
        ["stay", { title: "在杭州" }],
        ["lake", { title: "西湖" }],
      ]),
    } as unknown as PlanView;
    const layout = {
      background: [{ blockId: "stay", from: 0, to: 1440 }],
      main: [{ blockId: "lake", from: 540, to: 720 }],
    } as unknown as RowLayout;
    const text = (blockId: string, minutes: number, background: boolean) =>
      tagText(plan, blockId, minutes, { title: true, duration: true, money: false }, new Map(), background);

    expect(tagItems(plan, layout, text)).toEqual([
      { blockId: "stay", from: 0, full: "在杭州", short: "在杭州" },
      { blockId: "lake", from: 540, full: "西湖 3 小时", short: "西湖" },
    ]);
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
