// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  addBlock,
  addExpense,
  addKind,
  deleteKind,
  setBlockIndent,
  setBlockLayer,
  updateBlock,
  type AddBlockInput,
} from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, dayRow, daysFromOct1, openStoredPlan, pressedView, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

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

/** 时间轴上标签里含 text 的那一行（比如「10.2」）。 */
async function timelineRow(text: string): Promise<HTMLElement> {
  const row = within(await timeline())
    .getAllByRole("listitem")
    .find((item) => item.getAttribute("aria-label")?.includes(text));
  if (!row) throw new Error(`时间轴上没有含「${text}」的那一行`);
  return row;
}

/** 这一行里读屏名以「title 」开头的那段横条的外框。 */
function segmentOf(row: HTMLElement, title: string): HTMLElement {
  const button = within(row).getByRole("button", { name: new RegExp(`^${title} `) });
  return button.closest<HTMLElement>("[data-segment]")!;
}

function segmentData(segment: HTMLElement) {
  const { from, to, track, lane, depth, pending } = segment.dataset;
  return { from, to, track, lane, depth, pending };
}

/** 这一行的「没排时间」栏。 */
function trayOf(row: HTMLElement): HTMLElement {
  return within(row).getByRole("group", { name: "没排时间" });
}

/** 栏里每件的读屏名，按顺序。 */
function chipNames(tray: HTMLElement): string[] {
  return within(tray)
    .queryAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? "");
}

async function pressFilter(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(within(await screen.findByRole("group", { name: "按状态筛选" })).getByRole("button", { name }));
}

/** 「分组」里 name 这个按钮是不是按下的。 */
function groupingPressed(name: string): string | null {
  return within(screen.getByRole("group", { name: "分组" })).getByRole("button", { name }).getAttribute("aria-pressed");
}

const HINT = "排上时间的事会画在这里：把右边没排时间的事拖到时间轴上，或者点开它排时间";

describe("时间轴一天一行", () => {
  it("两天的计划：标签和刻度", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const region = await timeline();
    expect(
      within(region)
        .getAllByRole("listitem")
        .map((row) => row.getAttribute("aria-label")),
    ).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五"]);
    expect([...region.querySelectorAll("[data-hour-tick]")].map((tick) => tick.textContent)).toEqual(
      ["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"],
    );
  });
});

describe("块怎么画", () => {
  it("按时长占宽度；时长为 0 画在那一刻；没排时间的不画在横轴上", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "看潮", minute: 720, duration: 0 });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const row = await timelineRow("10.1");
    expect(within(row).getByRole("button", { name: "西湖 09:00–12:00" })).toBeTruthy();
    const lake = segmentOf(row, "西湖");
    expect(segmentData(lake)).toMatchObject({ from: "540", to: "720", track: "main", lane: "1", depth: "0" });
    expect(lake.style.left).toBe("37.5%");
    expect(lake.style.width).toBe("12.5%");

    expect(within(row).getByRole("button", { name: "看潮 12:00" })).toBeTruthy();
    const tide = segmentOf(row, "看潮");
    expect(segmentData(tide)).toMatchObject({ from: "720", to: "720" });
    expect(tide.style.left).toBe("50%");

    expect(row.querySelectorAll('[data-segment] [aria-label^="灵隐寺"]')).toHaveLength(0);
  });

  it("住一晚画两段；停留、住宿画在背景条；叠在上面的缩进", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "stay", title: "在杭州", minute: 0, duration: 2880 });
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", minute: 1320, duration: 600 });
      const hengdian = block(plan, library, { baseId: oct1!, kindId: "sight", title: "横店", minute: 480, duration: 720 });
      const palace = block(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      setBlockLayer(plan, library, palace, hengdian);
    });

    const oct1 = await timelineRow("10.1");
    expect(segmentData(segmentOf(oct1, "在杭州"))).toMatchObject({ track: "background", lane: "1", from: "0", to: "1440" });
    expect(segmentData(segmentOf(oct1, "民宿"))).toMatchObject({ track: "background", lane: "2", from: "1320", to: "1440" });
    expect(segmentData(segmentOf(oct1, "横店"))).toMatchObject({ track: "main", lane: "1", depth: "0" });
    expect(segmentData(segmentOf(oct1, "明清宫苑"))).toMatchObject({ track: "main", lane: "1", depth: "1" });

    const oct2 = await timelineRow("10.2");
    expect(segmentData(segmentOf(oct2, "在杭州"))).toMatchObject({ track: "background", lane: "1", from: "0", to: "1440" });
    expect(segmentData(segmentOf(oct2, "民宿"))).toMatchObject({ track: "background", lane: "2", from: "0", to: "480" });
  });

  it("颜色看类型、类型被删用灰色；待定虚线", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "food", statusId: "confirmed", title: "午饭", minute: 720, duration: 60 });
      const camping = addKind(library, { name: "露营", color: "#6b8fb0" });
      if (!camping.ok) throw new Error("建类型失败");
      block(plan, library, { baseId: oct1!, kindId: camping.value.kindId, title: "营地", minute: 1080, duration: 120 });
      deleteKind(library, camping.value.kindId);
    });

    const row = await timelineRow("10.1");
    const lake = segmentOf(row, "西湖");
    expect(lake.style.getPropertyValue("--kind-color")).toBe("#77a389");
    expect(lake.dataset.pending).toBe("true");
    const lunch = segmentOf(row, "午饭");
    expect(lunch.style.getPropertyValue("--kind-color")).toBe("#c08d68");
    expect(lunch.dataset.pending).toBe("false");
    expect(segmentOf(row, "营地").style.getPropertyValue("--kind-color")).toBe("#9aa3ad");
  });

  it("只看已确认的：只画通过筛选的块，重新分道", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "sight", statusId: "confirmed", title: "游船", minute: 600, duration: 60 });
    });
    expect(segmentData(segmentOf(await timelineRow("10.1"), "游船"))).toMatchObject({ lane: "2" });

    await pressFilter(user, "已确认");

    await waitFor(async () => expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(segmentData(segmentOf(await timelineRow("10.1"), "游船"))).toMatchObject({ lane: "1" });
  });
});

describe("没排时间栏", () => {
  function listForOct1(plan: Y.Doc, library: Y.Doc): void {
    const [oct1] = daysFromOct1(plan, 1);
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "morning", duration: 120 });
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" });
    block(plan, library, { baseId: oct1!, kindId: "sight", statusId: "confirmed", title: "宋城", slot: "afternoon" });
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
  }

  it("按整天、上午、下午、晚上排，只放没排时间的；颜色和虚实同横条", async () => {
    await openStoredPlan(listForOct1);

    const tray = trayOf(await timelineRow("10.1"));
    expect(chipNames(tray)).toEqual(["河坊街 整天", "灵隐寺 上午 · 2 小时", "宋城 下午"]);
    const temple = within(tray).getByRole("button", { name: "灵隐寺 上午 · 2 小时" }).closest<HTMLElement>("[data-undated-chip]")!;
    expect(temple.style.getPropertyValue("--kind-color")).toBe("#77a389");
    expect(temple.dataset.pending).toBe("true");
    const songcheng = within(tray).getByRole("button", { name: "宋城 下午" }).closest<HTMLElement>("[data-undated-chip]")!;
    expect(songcheng.dataset.pending).toBe("false");
  });

  it("只看已确认的：栏里也只剩通过筛选的", async () => {
    const user = userEvent.setup();
    await openStoredPlan(listForOct1);

    await pressFilter(user, "已确认");

    await waitFor(async () => expect(chipNames(trayOf(await timelineRow("10.1")))).toEqual(["宋城 下午"]));
  });

  it("点开详情面板：类型、状态和时间", async () => {
    const user = userEvent.setup();
    await openStoredPlan(listForOct1);

    await user.click(within(trayOf(await timelineRow("10.1"))).getByRole("button", { name: "灵隐寺 上午 · 2 小时" }));

    const dialog = screen.getByRole("dialog", { name: "灵隐寺" });
    expect(within(dialog).getByRole("button", { name: "类型：游玩" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "状态：待定" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "时间" }).textContent).toBe("上午 · 2 小时");
  });

  it("缩进了的往右缩 12 像素", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" });
      const temple = block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
      setBlockIndent(plan, temple, 1);
    });

    const tray = trayOf(await timelineRow("10.1"));
    const chipOf = (title: string) =>
      within(tray).getByRole("button", { name: new RegExp(`^${title} `) }).closest<HTMLElement>("[data-undated-chip]")!;
    expect(chipOf("河坊街").style.marginLeft).toBe("");
    expect(chipOf("灵隐寺").style.marginLeft).toBe("12px");
  });

  it("空的一天也有栏", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 2));
    expect(chipNames(trayOf(await timelineRow("10.2")))).toEqual([]);
  });
});

describe("空的时候", () => {
  it("一件事都没有：写先加事；点「加第一件事」不切视图，焦点到时间轴第 1 天那一行的「加一件事」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    const region = await timeline();
    expect(within(region).getByText("还没有事。加了事、排上时间，就会画在这里")).toBeTruthy();
    expect(within(region).queryByText(HINT)).toBeNull();
    await user.click(within(region).getByRole("button", { name: "加第一件事" }));

    expect(pressedView()).toBe("时间轴");
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await timelineRow("10.1")).getByRole("textbox", { name: "加一件事" })),
    );
  });

  it("加了第一件事：时间轴换回怎么排上时间的那句，「加第一件事」不见", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await user.click(within(await timeline()).getByRole("button", { name: "加第一件事" }));
    await waitFor(() => expect((document.activeElement as HTMLElement | null)?.getAttribute("aria-label")).toBe("加一件事"));

    await user.keyboard("西湖{Enter}");
    // 加了第一件事，「只看」那一排才出来
    await screen.findByRole("group", { name: "按状态筛选" });

    const region = await timeline();
    expect(within(region).getByText(HINT)).toBeTruthy();
    expect(within(region).queryByText("还没有事。加了事、排上时间，就会画在这里")).toBeNull();
    expect(within(region).queryByRole("button", { name: "加第一件事" })).toBeNull();
    expect(chipNames(trayOf(await timelineRow("10.1")))).toEqual(["西湖 整天"]);
  });

  it("事删光了：「加第一件事」又出来", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    expect(within(await timeline()).queryByRole("button", { name: "加第一件事" })).toBeNull();

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));

    expect(await within(await timeline()).findByRole("button", { name: "加第一件事" })).toBeTruthy();
  });

  it("还没排时间：照样有行，写怎么排上时间", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    expect(await timelineRow("10.1")).toBeTruthy();
    expect(within(await timeline()).getByText(HINT)).toBeTruthy();
  });

  it("被筛掉了：没有横条，也不写那句", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });
    expect(within(await timeline()).queryByText(HINT)).toBeNull();

    await pressFilter(user, "已确认");

    await waitFor(async () => expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(within(await timeline()).queryByText(HINT)).toBeNull();
  });
});

describe("点块看详情", () => {
  it("点跨午夜的第二段：打开详情面板", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const inn = block(plan, library, {
        baseId: oct1!,
        kindId: "lodging",
        statusId: "confirmed",
        title: "民宿",
        minute: 1320,
        duration: 600,
      });
      updateBlock(plan, library, inn, { subtitle: "湖景房" });
      addExpense(plan, library, { title: "房费", amountCents: 48000, blockIds: [inn] });
    });

    await user.click(within(await timelineRow("10.2")).getByRole("button", { name: /^民宿 / }));

    const dialog = screen.getByRole("dialog", { name: "民宿" });
    expect(within(dialog).getByRole("button", { name: "时间" }).textContent).toBe("22:00–10.2 08:00 · 10 小时");
    expect(within(dialog).getByRole("button", { name: "钱" }).textContent).toBe("¥480");
  });

  it("点横条：打开详情面板，没有「在表里改」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    await user.click(within(await timelineRow("10.1")).getByRole("button", { name: /^西湖 / }));

    const dialog = screen.getByRole("dialog", { name: "西湖" });
    expect(within(dialog).getByRole("button", { name: "时间" }).textContent).toBe("09:00–12:00 · 3 小时");
    expect(screen.queryByRole("button", { name: "在表里改" })).toBeNull();
  });

  it("Esc 关掉：焦点回到横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    const bar = within(await timelineRow("10.1")).getByRole("button", { name: /^西湖 / });
    await user.click(bar);
    expect(screen.getByRole("dialog", { name: "西湖" })).toBeTruthy();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    expect(document.activeElement).toBe(bar);
  });
});
