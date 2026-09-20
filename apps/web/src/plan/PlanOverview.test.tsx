// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockMark, setPlanSettings } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, pressedView, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, title: string, cents: number | null, kindId: string, blockIds: string[] = []) {
  const result = addExpense(plan, library, { title, amountCents: cents, kindId, blockIds });
  if (!result.ok) throw new Error("建开销失败");
}

/**
 * 3 人。10.1：西湖（游玩 09:00 3 小时，门票 ¥300）、午饭（餐饮 12:00 1 小时，午饭钱 ¥120）、
 * 民宿（住宿 22:00 10 小时，房费 ¥480）；10.2：乌镇（游玩 09:00 2 小时，没开销）。签证 ¥600 不属于任何一天。
 */
function trip(plan: Y.Doc, library: Y.Doc): void {
  if (!setPlanSettings(plan, { traveler_count: 3 }).ok) throw new Error("改人数失败");
  const [oct1, oct2] = daysFromOct1(plan, 2);
  const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
  const lunch = timed(plan, library, oct1!, "午饭", "food", 720, 60);
  const inn = timed(plan, library, oct1!, "民宿", "lodging", 1320, 600);
  timed(plan, library, oct2!, "乌镇", "sight", 540, 120);
  money(plan, library, "门票", 30000, "sight", [lake]);
  money(plan, library, "午饭钱", 12000, "food", [lunch]);
  money(plan, library, "房费", 48000, "lodging", [inn]);
  money(plan, library, "签证", 60000, "other");
}

async function moneyCard(): Promise<HTMLElement> {
  await showView("总览");
  return screen.findByRole("region", { name: "开销总览" });
}

async function timeCard(): Promise<HTMLElement> {
  await showView("总览");
  return screen.findByRole("region", { name: "时间总览" });
}

/** 说明里每一类的按钮上写的字。 */
function legend(card: HTMLElement): string[] {
  return within(card)
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

async function pickKindOf(user: User, card: HTMLElement, name: string): Promise<void> {
  await user.click(within(card).getByRole("button", { name: new RegExp(`^${name} `) }));
}

describe("总览：开销的环", () => {
  it("环中间是总额和人均，说明按金额从多到少", async () => {
    await openStoredPlan(trip);

    const card = await moneyCard();

    expect(card.querySelector("[data-donut-total]")?.textContent).toBe("¥1,500");
    expect(card.querySelector("[data-donut-note]")?.textContent).toBe("人均 ¥500");
    expect(legend(card)).toEqual(["其他 ¥600 · 40%", "住宿 ¥480 · 32%", "游玩 ¥300 · 20%", "餐饮 ¥120 · 8%"]);
  });

  it("点一类：下面列出这一类的每一笔，再点「收起」关掉", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const card = await moneyCard();

    await pickKindOf(user, card, "住宿");

    const opened = await screen.findByRole("region", { name: "住宿的开销" });
    expect(within(opened).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["房费 ¥480 · 10.1 民宿"]);

    await user.click(within(opened).getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("region", { name: "住宿的开销" })).toBeNull();
  });

  it("点开的那一类：「只看这一类」按下筛选那一排的这个类型", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const card = await moneyCard();
    await pickKindOf(user, card, "住宿");

    await user.click(within(await screen.findByRole("region", { name: "住宿的开销" })).getByRole("button", { name: "只看这一类" }));

    const kinds = screen.getByRole("group", { name: "按类型筛选" });
    expect(within(kinds).getByRole("button", { name: "住宿" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("点开的那一笔：跳到挂着它的那件事", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const card = await moneyCard();
    await pickKindOf(user, card, "住宿");

    await user.click(within(await screen.findByRole("region", { name: "住宿的开销" })).getByRole("button", { name: /^房费/ }));

    await waitFor(() => expect(pressedView()).toBe("时间线"));
  });

  it("有没填的：写一句；不属于任何一天还能增删改", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      timed(plan, library, oct1!, "午饭", "food", 720, 60);
      money(plan, library, "门票", 30000, "sight", [lake]);
      money(plan, library, "停车", null, "transit", [lake]);
    });

    const card = await moneyCard();
    expect(card.querySelector("[data-money-note]")?.textContent).toBe(
      "只算已填的 1 笔，还有 1 笔没填 · 另有 1 件事还没填开销",
    );

    await user.click(within(card).getByRole("button", { name: /^不属于任何一天/ }));
    const editor = within(card).getByRole("group", { name: "不属于任何一天的开销" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的说明" }), "签证");
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "600{Enter}");

    await waitFor(async () =>
      expect(within(await moneyCard()).getByRole("button", { name: /^不属于任何一天/ }).textContent).toContain("¥600"),
    );
  });
});

describe("总览：时间的环", () => {
  it("环中间是排了多久和还有多少没排，说明按时长从多到少", async () => {
    await openStoredPlan(trip);

    const card = await timeCard();

    // 民宿是住宿（不是最底层），算进来：10 小时；游玩 3 + 2 = 5 小时；餐饮 1 小时
    expect(card.querySelector("[data-donut-total]")?.textContent).toBe("16 小时");
    expect(legend(card)).toEqual(["住宿 10 小时 · 63%", "游玩 5 小时 · 31%", "餐饮 1 小时 · 6%"]);
  });

  it("有没排时间的事：环中间下面写还有多少没排", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      const result = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day", duration: 90 });
      if (!result.ok) throw new Error("建块失败");
    });

    const card = await timeCard();

    expect(card.querySelector("[data-donut-note]")?.textContent).toBe("还有 1.5 小时没排");
  });

  it("点一类：列出这一类排了时间的事，点一条跳过去", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const card = await timeCard();

    await pickKindOf(user, card, "游玩");

    const opened = await screen.findByRole("region", { name: "游玩的事" });
    expect(within(opened).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "西湖 10.1 09:00 · 3 小时",
      "乌镇 10.2 09:00 · 2 小时",
    ]);

    await user.click(within(opened).getByRole("button", { name: /^乌镇/ }));
    await waitFor(() => expect(pressedView()).toBe("时间线"));
  });

  it("待定、完成几件写在时间卡片最下面", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      timed(plan, library, oct1!, "午饭", "food", 720, 60);
      if (!setBlockMark(plan, [lake], "done").ok) throw new Error("完成失败");
    });

    const card = await timeCard();

    expect(card.querySelector("[data-check-line]")?.textContent).toBe("完成 1 件，共 2 件");
    // 环只算没被筛掉的：这里没筛，完成的照样算
    expect(legend(card)).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  });
});

describe("总览：删掉的两张卡片", () => {
  it("没有「每天」那张表了", async () => {
    await openStoredPlan(trip);

    await showView("总览");

    expect(screen.queryByRole("region", { name: "每天" })).toBeNull();
    expect(screen.queryByRole("region", { name: "占比" })).toBeNull();
  });
});
