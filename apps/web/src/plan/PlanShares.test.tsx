// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, updateKind } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  daysFromOct1,
  openStoredPlan,
  overviewCard,
  ringMoney,
  ringRowCells,
  ringSliceCount,
  ringTime,
  showRing,
  showView,
} from "./test-helpers";

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
  if (!result.ok) throw new Error("建开销失败");
}

describe("总览这张卡片", () => {
  it("只在「总览」这个视图里", async () => {
    await openStoredPlan((plan) => {
      oneDay(plan);
    });

    await showView("总览");

    expect(await overviewCard()).toBeTruthy();
    // 状态去掉了，不再写「定没定」
    expect(screen.queryByRole("group", { name: "定没定" })).toBeNull();
    // 时间线、日程里都没有它
    await showView("时间线");
    expect(screen.queryByRole("region", { name: "总览" })).toBeNull();
  });
});

describe("按类型的占比：钱", () => {
  it("按类型分：环按比例分段，每类一行从多到少", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "transit", 20000);
      money(plan, library, "lodging", 120000);
      money(plan, library, "food", 60000);
    });
    const card = await overviewCard();
    expect(ringRowCells(card, "money")).toEqual(["住宿 ¥1,200 · 60%", "餐饮 ¥600 · 30%", "交通 ¥200 · 10%"]);
    expect(ringSliceCount(card)).toBe(3);
  });

  it("只算已填的：写明还有几笔没填，全没填的类不上环", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "lodging", 120000);
      money(plan, library, "food", 60000);
      money(plan, library, "food", null);
      money(plan, library, "shopping", null);
    });
    const card = await overviewCard();
    expect(card.querySelector("[data-money-note]")?.textContent).toBe("只算已填的 2 笔，还有 2 笔没填");
    // 全没填、也没排时间的「购物」哪一格都画不出来：不上环、也没有那一行（那几笔算在上面那句里）
    expect(ringRowCells(card, "money")).toEqual(["住宿 ¥1,200 · 67%", "餐饮 ¥600 · 33%"]);
    expect(ringSliceCount(card)).toBe(2);
  });

  it("还没有填了金额的开销", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "food", null);
    });
    const card = await overviewCard();
    expect(card.textContent).toContain("还没有填了金额的开销");
    // 环上一段都没有，画成一整圈淡灰：圆心那行写「—」
    expect(ringMoney(card)).toBe("—");
    expect(ringRowCells(card, "money")).toEqual([]);
    expect(ringSliceCount(card)).toBe(0);
  });

  it("填了的加起来是 0", async () => {
    await openStoredPlan((plan, library) => {
      oneDay(plan);
      money(plan, library, "sight", 0);
    });
    const card = await overviewCard();
    expect(card.textContent).toContain("填了金额的 1 笔加起来是 ¥0");
    expect(ringMoney(card)).toBe("—");
    expect(ringRowCells(card, "money")).toEqual([]);
  });

  it("填一笔开销，环跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => {
      oneDay(plan);
    });
    const card = await overviewCard();
    expect(card.textContent).toContain("还没有填了金额的开销");

    await user.click(within(card).getByRole("button", { name: "不属于任何一天：¥0" }));
    const editor = screen.getByRole("group", { name: "不属于任何一天的开销" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "600{Enter}");

    await waitFor(() => expect(ringRowCells(card, "money")).toEqual(["其他 ¥600 · 100%"]));
    expect(ringMoney(card)).toBe("¥600");
    expect(card.querySelector("[data-money-note]")).toBeNull();
  });
});

describe("按类型的占比：时间", () => {
  function hangzhouDay(plan: Y.Doc, library: Y.Doc): void {
    const oct1 = oneDay(plan);
    timed(plan, library, oct1, "在杭州", "stay", 0, 1440);
    timed(plan, library, oct1, "西湖", "sight", 540, 180);
    timed(plan, library, oct1, "午饭", "food", 720, 60);
  }

  it("默认不算停留；勾上「算上最底层的类型」才算，取消又不算", async () => {
    const user = userEvent.setup();
    await openStoredPlan(hangzhouDay);
    const card = await overviewCard();
    const baseLayer = within(card).getByRole<HTMLInputElement>("checkbox", { name: "算上最底层的类型（停留）" });
    expect(baseLayer.checked).toBe(false);
    expect(ringRowCells(card, "time")).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
    await showRing(user, card, "时间");
    expect(ringSliceCount(card)).toBe(2);

    await user.click(baseLayer);
    expect(ringRowCells(card, "time")).toEqual(["停留 20 小时 · 83%", "游玩 3 小时 · 13%", "餐饮 1 小时 · 4%"]);
    expect(ringSliceCount(card)).toBe(3);

    await user.click(baseLayer);
    expect(ringRowCells(card, "time")).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  });

  it("还没有排了时间的事", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      undated(plan, library, oneDay(plan), "灵隐寺", "sight");
    });
    const card = await overviewCard();
    expect(within(card).getByText("还没有排了时间的事")).toBeTruthy();
    // 拨到时间那边：环上一段都没有，圆心大字写「—」
    await showRing(user, card, "时间");
    expect(ringTime(card)).toBe("—");
    expect(ringRowCells(card, "money")).toEqual([]);
    expect(ringSliceCount(card)).toBe(0);
    expect(within(card).queryByRole("checkbox")).toBeNull();
  });

  it("停留没排时间：不显示勾选（勾不勾都一样）", async () => {
    await openStoredPlan((plan, library) => {
      const oct1 = oneDay(plan);
      undated(plan, library, oct1, "在杭州", "stay");
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const card = await overviewCard();
    expect(ringRowCells(card, "time")).toEqual(["游玩 3 小时 · 100%"]);
    expect(within(card).queryByRole("checkbox")).toBeNull();
  });

  it("只排了停留的时间：写明除了停留还没有排；勾上就看得到停留", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      timed(plan, library, oneDay(plan), "在杭州", "stay", 0, 1440);
    });
    const card = await overviewCard();
    expect(within(card).getByText("除了停留，还没有排了时间的事")).toBeTruthy();

    await user.click(within(card).getByRole("checkbox", { name: "算上最底层的类型（停留）" }));
    expect(ringRowCells(card, "time")).toEqual(["停留 24 小时 · 100%"]);
    expect(within(card).queryByText("除了停留，还没有排了时间的事")).toBeNull();
  });

  it("没有层为 0 的类型：不显示勾选，停留照常算", async () => {
    await openStoredPlan((plan, library) => {
      updateKind(library, "stay", { layer: 1 });
      const oct1 = oneDay(plan);
      timed(plan, library, oct1, "在杭州", "stay", 0, 1440);
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const card = await overviewCard();
    expect(within(card).queryByRole("checkbox")).toBeNull();
    expect(ringRowCells(card, "time")).toEqual(["停留 21 小时 · 88%", "游玩 3 小时 · 12%"]);
  });
});
