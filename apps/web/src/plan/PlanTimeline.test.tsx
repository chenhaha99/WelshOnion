// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  addBlock,
  addExpense,
  addKind,
  deleteKind,
  setBlockLayer,
  updateBlock,
  type AddBlockInput,
} from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

async function timeline(): Promise<HTMLElement> {
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

async function pressFilter(user: ReturnType<typeof userEvent.setup>, name: string): Promise<void> {
  await user.click(within(await screen.findByRole("group", { name: "按状态筛选" })).getByRole("button", { name }));
}

const HINT = "排上时间的事会画在这里：在下面的安排表里点时间格排时间";

describe("时间轴一天一行", () => {
  it("两天的计划：标签和刻度，放在「只看」和钱的总览中间", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const region = await timeline();
    expect(within(region).getAllByRole("listitem").map((row) => row.getAttribute("aria-label"))).toEqual([
      "第 1 天 · 10.1 周四",
      "第 2 天 · 10.2 周五",
    ]);
    expect([...region.querySelectorAll("[data-hour-tick]")].map((tick) => tick.textContent)).toEqual(
      ["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"],
    );
    const filter = screen.getByRole("group", { name: "按状态筛选" });
    const money = screen.getByRole("region", { name: "钱的总览" });
    expect(filter.compareDocumentPosition(region) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(region.compareDocumentPosition(money) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("块怎么画", () => {
  it("按时长占宽度；时长为 0 画在那一刻；没排时间的不画", async () => {
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

    expect(within(await timeline()).queryByRole("button", { name: /^灵隐寺/ })).toBeNull();
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

describe("空的时候", () => {
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
  it("看住一晚的详情：点第二天那段", async () => {
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
    for (const text of ["住宿 · 已确认", "22:00–10.2 08:00 · 10 小时", "湖景房", "钱：¥480"]) {
      expect(within(dialog).getByText(text)).toBeTruthy();
    }
  });

  it("路程和长备注；没挂钱就不写钱", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const drive = block(plan, library, { baseId: oct1!, kindId: "transit", title: "开车去南浔", minute: 540, duration: 180 });
      updateBlock(plan, library, drive, { transport_mode: "drive", distance_m: 132000, note: "走高速" });
    });

    await user.click(within(await timelineRow("10.1")).getByRole("button", { name: /^开车去南浔 / }));

    const dialog = screen.getByRole("dialog", { name: "开车去南浔" });
    for (const text of ["交通 · 待定", "09:00–12:00 · 3 小时", "自驾 · 132 公里", "走高速"]) {
      expect(within(dialog).getByText(text)).toBeTruthy();
    }
    expect(within(dialog).queryByText(/^钱：/)).toBeNull();
  });

  it("在表里改：关掉详情，焦点到安排表这一行的标题框", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    await user.click(within(await timelineRow("10.1")).getByRole("button", { name: /^西湖 / }));
    await user.click(within(screen.getByRole("dialog", { name: "西湖" })).getByRole("button", { name: "在表里改" }));

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    const title = within(await blockRow("10.1", "西湖")).getByRole("textbox", { name: "标题" });
    expect(document.activeElement).toBe(title);
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
