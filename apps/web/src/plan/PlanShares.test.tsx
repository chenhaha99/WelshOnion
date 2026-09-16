// @vitest-environment happy-dom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, addStatus, setBlockStatus, updateKind } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 10.1 一天，返回底座 id。 */
function oneDay(plan: Y.Doc): string {
  return daysFromOct1(plan, 1)[0]!;
}

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function undated(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string): string {
  const result = addBlock(plan, library, { baseId, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, kindId: string, cents: number | null): void {
  const result = addExpense(plan, library, { title: kindId, amountCents: cents, kindId });
  if (!result.ok) throw new Error("建钱失败");
}

/** 占比卡片里的一块：「钱的占比」「时间的占比」「定没定」。 */
async function part(name: string): Promise<HTMLElement> {
  const card = await screen.findByRole("region", { name: "占比" });
  return within(card).getByRole("group", { name });
}

/** 条下面的说明，按显示顺序。 */
function legend(group: HTMLElement): string[] {
  return within(group)
    .queryAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

/** 条上有几段。 */
function segmentCount(group: HTMLElement): number {
  return group.querySelectorAll("[data-share-segment]").length;
}

describe("占比卡片", () => {
  it("在钱的总览下面、日期列表上面", async () => {
    await openStoredPlan((plan) => {
      oneDay(plan);
    });
    const card = await screen.findByRole("region", { name: "占比" });
    const overview = screen.getByRole("region", { name: "钱的总览" });
    await showView("列表");
    const days = screen.getByRole("list", { name: "日期列表" });
    expect(overview.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(days) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("钱的占比", () => {
  it("按类型分：条按比例分段，说明从多到少", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "transit", 20000);
      money(plan, library, "lodging", 120000);
      money(plan, library, "food", 60000);
    });
    const group = await part("钱的占比");
    expect(legend(group)).toEqual(["住宿 ¥1,200 · 60%", "餐饮 ¥600 · 30%", "交通 ¥200 · 10%"]);
    expect(segmentCount(group)).toBe(3);
  });

  it("只算已填的：写明还有几笔没填，全没填的类不进条", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "lodging", 120000);
      money(plan, library, "food", 60000);
      money(plan, library, "food", null);
      money(plan, library, "shopping", null);
    });
    const group = await part("钱的占比");
    expect(within(group).getByText("只算已填的 2 笔，还有 2 笔没填")).toBeTruthy();
    expect(legend(group)).toEqual(["住宿 ¥1,200 · 67%", "餐饮 ¥600 · 33% · 还有 1 笔没填", "购物 · 还有 1 笔没填"]);
    expect(segmentCount(group)).toBe(2);
  });

  it("还没有填了金额的钱", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "food", null);
    });
    const group = await part("钱的占比");
    expect(within(group).getByText("还没有填了金额的钱")).toBeTruthy();
    expect(legend(group)).toEqual([]);
    expect(segmentCount(group)).toBe(0);
  });

  it("填了的加起来是 0", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "sight", 0);
    });
    const group = await part("钱的占比");
    expect(within(group).getByText("填了金额的 1 笔加起来是 ¥0")).toBeTruthy();
    expect(legend(group)).toEqual([]);
  });

  it("填一笔钱，占比跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => {
      oneDay(plan);
    });
    const group = await part("钱的占比");
    expect(within(group).getByText("还没有填了金额的钱")).toBeTruthy();

    const overview = screen.getByRole("region", { name: "钱的总览" });
    await user.click(within(overview).getByRole("button", { name: "不属于任何一天：¥0" }));
    const editor = screen.getByRole("group", { name: "不属于任何一天的钱" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "600{Enter}");

    expect(await within(group).findByText("其他 ¥600 · 100%")).toBeTruthy();
    expect(within(group).queryByText("还没有填了金额的钱")).toBeNull();
  });
});

describe("时间的占比", () => {
  function hangzhouDay(plan: Y.Doc, library: Y.Doc): void {
    const oct1 = oneDay(plan);
    timed(plan, library, oct1, "在杭州", "stay", 0, 1440);
    timed(plan, library, oct1, "西湖", "sight", 540, 180);
    timed(plan, library, oct1, "午饭", "food", 720, 60);
  }

  it("默认不算停留；勾上「算上最底层的类型」才算，取消又不算", async () => {
    const user = userEvent.setup();
    await openStoredPlan(hangzhouDay);
    const group = await part("时间的占比");
    const baseLayer = within(group).getByRole<HTMLInputElement>("checkbox", { name: "算上最底层的类型（停留）" });
    expect(baseLayer.checked).toBe(false);
    expect(legend(group)).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
    expect(segmentCount(group)).toBe(2);

    await user.click(baseLayer);
    expect(legend(group)).toEqual(["停留 20 小时 · 83%", "游玩 3 小时 · 13%", "餐饮 1 小时 · 4%"]);
    expect(segmentCount(group)).toBe(3);

    await user.click(baseLayer);
    expect(legend(group)).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  });

  it("还没有排了时间的事", async () => {
    await openStoredPlan((plan, library) => {
      undated(plan, library, oneDay(plan), "灵隐寺", "sight");
    });
    const group = await part("时间的占比");
    expect(within(group).getByText("还没有排了时间的事")).toBeTruthy();
    expect(legend(group)).toEqual([]);
    expect(segmentCount(group)).toBe(0);
    expect(within(group).queryByRole("checkbox")).toBeNull();
  });

  it("停留没排时间：不显示勾选（勾不勾都一样）", async () => {
    await openStoredPlan((plan, library) => {
      const oct1 = oneDay(plan);
      undated(plan, library, oct1, "在杭州", "stay");
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const group = await part("时间的占比");
    expect(legend(group)).toEqual(["游玩 3 小时 · 100%"]);
    expect(within(group).queryByRole("checkbox")).toBeNull();
  });

  it("只排了停留的时间：写明除了停留还没有排；勾上就看得到停留", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      timed(plan, library, oneDay(plan), "在杭州", "stay", 0, 1440);
    });
    const group = await part("时间的占比");
    expect(within(group).getByText("除了停留，还没有排了时间的事")).toBeTruthy();

    await user.click(within(group).getByRole("checkbox", { name: "算上最底层的类型（停留）" }));
    expect(legend(group)).toEqual(["停留 24 小时 · 100%"]);
    expect(within(group).queryByText("除了停留，还没有排了时间的事")).toBeNull();
  });

  it("没有层为 0 的类型：不显示勾选，停留照常算", async () => {
    await openStoredPlan((plan, library) => {
      updateKind(library, "stay", { layer: 1 });
      const oct1 = oneDay(plan);
      timed(plan, library, oct1, "在杭州", "stay", 0, 1440);
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const group = await part("时间的占比");
    expect(within(group).queryByRole("checkbox")).toBeNull();
    expect(legend(group)).toEqual(["停留 21 小时 · 88%", "游玩 3 小时 · 12%"]);
  });
});

describe("各状态几件", () => {
  it("含自建状态", async () => {
    await openStoredPlan((plan, library) => {
      const oct1 = oneDay(plan);
      const booked = addStatus(library, { name: "已预订", color: "#6b8fb0" });
      if (!booked.ok) throw new Error("建状态失败");
      undated(plan, library, oct1, "西湖", "sight");
      undated(plan, library, oct1, "灵隐寺", "sight");
      setBlockStatus(plan, library, [undated(plan, library, oct1, "午饭", "food")], "confirmed");
      setBlockStatus(plan, library, [undated(plan, library, oct1, "酒店", "lodging")], booked.value.statusId);
    });
    const group = await part("定没定");
    expect(within(group).getByText("4 件事：待定 2 · 已确认 1 · 已预订 1")).toBeTruthy();
  });

  it("还没有事", async () => {
    await openStoredPlan((plan) => {
      oneDay(plan);
    });
    expect(within(await part("定没定")).getByText("还没有事")).toBeTruthy();
  });
});
