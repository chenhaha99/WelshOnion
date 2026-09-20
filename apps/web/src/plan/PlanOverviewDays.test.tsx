// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { addBlock, addExpense, setBlockMark, setPlanSettings, updateBlock } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, pressedView, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
  vi.unstubAllGlobals();
});

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, cents: number | null, blockIds: string[], basis?: "per_person"): void {
  const result = addExpense(plan, library, { title: "钱", amountCents: cents, blockIds, ...(basis ? { basis } : {}) });
  if (!result.ok) throw new Error("建开销失败");
}

/** 规格「两天的行程」，再加一个空着的第 3 天。 */
async function openTrip(): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1, oct2] = daysFromOct1(plan, 3);
    if (!setPlanSettings(plan, { traveler_count: 3 }).ok) throw new Error("改人数失败");
    money(plan, library, 30000, [timed(plan, library, oct1!, "西湖", "sight", 540, 180)]);
    money(plan, library, null, [timed(plan, library, oct1!, "午饭", "food", 690, 60)]);
    const drive = timed(plan, library, oct1!, "去乌镇", "transit", 840, 120);
    if (!updateBlock(plan, library, drive, { transport_mode: "drive", distance_m: 130000 }).ok) throw new Error("改交通失败");
    timed(plan, library, oct1!, "民宿", "lodging", 1200, 600);
    if (!addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day", duration: 90 }).ok) {
      throw new Error("建块失败");
    }
    const wuzhen = timed(plan, library, oct2!, "乌镇", "sight", 540, 480);
    money(plan, library, 15000, [wuzhen], "per_person");
    if (!setBlockMark(plan, [wuzhen], "struck").ok) throw new Error("划掉失败");
    money(plan, library, 60000, []);
  });
}

async function daysCard(): Promise<HTMLElement> {
  await showView("总览");
  return screen.findByRole("region", { name: "每天" });
}

describe("总览里的「每天」", () => {
  it("在开销总览和占比中间", async () => {
    await openTrip();
    const card = await daysCard();
    const order = [screen.getByRole("region", { name: "开销总览" }), card, screen.getByRole("region", { name: "占比" })];
    for (let index = 0; index + 1 < order.length; index++) {
      expect(order[index]!.compareDocumentPosition(order[index + 1]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it("电脑上是一张表：一天一行，最后是不属于任何一天和合计", async () => {
    await openTrip();
    const table = within(await daysCard()).getByRole("table", { name: "每天" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["日期", "起–收工", "排了", "自驾", "还没排", "花", "几件"]);

    const rowHeaders = within(table)
      .getAllByRole("rowheader")
      .map((cell) => cell.textContent);
    expect(rowHeaders).toEqual([
      "第 1 天 · 10.1 周四",
      "第 2 天 · 10.2 周五",
      "第 3 天 · 10.3 周六",
      "不属于任何一天",
      "合计",
    ]);

    const oct1 = within(table).getByRole("rowheader", { name: /10\.1/ }).closest("tr")!;
    const cells = within(oct1)
      .getAllByRole("cell")
      .map((cell) => cell.textContent);
    expect(cells.slice(0, 4)).toEqual(["09:00–16:00", "5.5 小时", "2 小时 130 公里", "1.5 小时"]);
    expect(cells[4]).toContain("¥300");
    expect(cells[4]).toContain("1 笔没填");
    expect(cells[5]).toBe("5 件");

    const total = within(table).getByRole("rowheader", { name: "合计" }).closest("tr")!;
    expect(within(total).getAllByRole("cell")[4]!.textContent).toContain("¥1,350");
  });

  it("整趟没有自驾：没有「自驾」这一列", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      money(plan, library, 30000, [timed(plan, library, oct1!, "西湖", "sight", 540, 180)]);
    });
    const table = within(await daysCard()).getByRole("table", { name: "每天" });
    const headers = within(table)
      .getAllByRole("columnheader")
      .map((cell) => cell.textContent);
    expect(headers).toEqual(["日期", "起–收工", "排了", "花", "几件"]);
    const oct1 = within(table).getByRole("rowheader", { name: /10\.1/ }).closest("tr")!;
    expect(within(oct1).getAllByRole("cell").map((cell) => cell.textContent)).toEqual([
      "09:00–12:00",
      "3 小时",
      "¥300",
      "1 件",
    ]);
  });

  it("一件事、一笔开销都没有：只写一句", async () => {
    await openStoredPlan((plan) => {
      daysFromOct1(plan, 2);
    });
    const card = await daysCard();
    expect(within(card).queryByRole("table")).toBeNull();
    expect(card.textContent).toContain("还没有事，也没有开销");
  });

  it("点日期：切到时间线，焦点到那天的「这天的操作」", async () => {
    await openTrip();
    const card = await daysCard();
    fireEvent.click(within(card).getByRole("button", { name: "在时间线上看 第 2 天 · 10.2 周五" }));

    expect(pressedView()).toBe("时间线");
    await waitFor(() => {
      const menu = document.activeElement as HTMLElement;
      expect(menu.getAttribute("aria-label")).toBe("这天的操作");
      // 时间线上那天一行（`<li aria-label>`）
      expect(menu.closest("[data-base-id]")?.getAttribute("aria-label")).toContain("10.2");
    });
  });
});

describe("手机上的「每天」", () => {
  it("一天两行字：第一行日期和花多少，第二行各项", async () => {
    stubNarrowScreen();
    await openTrip();
    const card = await daysCard();
    expect(within(card).queryByRole("table")).toBeNull();
    const list = within(card).getByRole("list", { name: "每天" });
    const [oct1] = within(list).getAllByRole("listitem");
    expect(within(oct1!).getByRole("button", { name: "在时间线上看 第 1 天 · 10.1 周四" })).toBeTruthy();
    expect(oct1!.querySelector("[data-day-money]")?.textContent).toBe("¥300");
    expect(oct1!.querySelector("[data-day-line]")?.textContent).toBe(
      "09:00 起 · 16:00 收工 · 排了 5.5 小时 · 自驾 2 小时 130 公里 · 还有 1.5 小时没排 · 1 笔没填 · 5 件",
    );
  });

  it("点日期：竖排翻到那天，焦点到它的「这天的操作」", async () => {
    stubNarrowScreen();
    await openTrip();
    const card = await daysCard();
    fireEvent.click(within(card).getByRole("button", { name: "在时间线上看 第 3 天 · 10.3 周六" }));

    expect(pressedView()).toBe("时间线");
    await waitFor(() => expect(document.querySelector("[data-timeline-day]")?.textContent).toBe("第 3 天 · 10.3 周六"));
    await waitFor(() => expect((document.activeElement as HTMLElement).getAttribute("aria-label")).toBe("这天的操作"));
  });
});
