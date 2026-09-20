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

async function card(): Promise<HTMLElement> {
  await showView("总览");
  return screen.findByRole("region", { name: "总览" });
}

/** 环外贴着的一圈标签上写的字，顺时针（也就是钱从多到少）。 */
function labels(box: HTMLElement): string[] {
  return within(within(box).getByRole("list", { name: "按类型" }))
    .getAllByRole("button")
    .map((button) => button.textContent ?? "");
}

function center(box: HTMLElement): { money: string | null; time: string | null; detail: string | null } {
  return {
    money: box.querySelector("[data-ring-money]")?.textContent ?? null,
    time: box.querySelector("[data-ring-time]")?.textContent ?? null,
    detail: box.querySelector("[data-ring-detail]")?.textContent ?? null,
  };
}

async function pickKind(user: User, box: HTMLElement, name: string): Promise<void> {
  await user.click(within(box).getByRole("button", { name: new RegExp(`^${name} `) }));
}

describe("总览：同心双环", () => {
  it("中间两行：总开销加人均、排了多久", async () => {
    await openStoredPlan(trip);

    const box = await card();

    expect(center(box).money).toBe("¥1,500");
    expect(box.textContent).toContain("人均 ¥500");
    // 西湖 3 + 午饭 1 + 民宿 10 + 乌镇 2
    expect(center(box).time).toBe("16 小时");
  });

  it("一类一个标签，贴在环外，按钱从多到少", async () => {
    await openStoredPlan(trip);

    const box = await card();

    expect(labels(box)).toEqual(["其他 ¥600 · 40%", "住宿 ¥480 · 32%", "游玩 ¥300 · 20%", "餐饮 ¥120 · 8%"]);
  });

  it("停在一类上：中间换成这一类的钱和时间", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const box = await card();

    await user.hover(within(box).getByRole("button", { name: /^住宿 / }));

    await waitFor(() => expect(center(box).money).toBe("¥480"));
    // 两行：一行钱、一行时间（挤在一行会顶出环中间那个洞）
    expect(center(box).detail).toBe("32% 的钱10 小时 · 63% 的时间");
    expect(box.textContent).toContain("住宿");
  });

  it("只有时间没有钱的类型：标签写时长，中间写「没花钱」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      timed(plan, library, oct1!, "开车", "transit", 780, 120);
      money(plan, library, "门票", 30000, "sight", [lake]);
    });
    const box = await card();

    expect(labels(box)).toEqual(["游玩 ¥300 · 100%", "交通 2 小时 · 40%"]);

    await user.hover(within(box).getByRole("button", { name: /^交通 / }));

    await waitFor(() => expect(center(box).money).toBe("没花钱"));
    expect(center(box).detail).toBe("2 小时 · 40% 的时间");
  });

  it("点一类：下面同时列这一类的每一笔和每一件，再点「收起」关掉", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const box = await card();

    await pickKind(user, box, "住宿");

    const opened = await screen.findByRole("region", { name: "住宿的明细" });
    expect(within(opened).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "房费 ¥480 · 10.1 民宿",
      "民宿 10.1 22:00 · 10 小时",
    ]);

    await user.click(within(opened).getByRole("button", { name: "收起" }));
    expect(screen.queryByRole("region", { name: "住宿的明细" })).toBeNull();
  });

  it("点开的那一类：「只看这一类」按下筛选那一排的这个类型", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const box = await card();
    await pickKind(user, box, "住宿");

    await user.click(within(await screen.findByRole("region", { name: "住宿的明细" })).getByRole("button", { name: "只看这一类" }));

    const kinds = screen.getByRole("group", { name: "按类型筛选" });
    expect(within(kinds).getByRole("button", { name: "住宿" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("点开里的一条：跳到那件事", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    const box = await card();
    await pickKind(user, box, "住宿");

    await user.click(within(await screen.findByRole("region", { name: "住宿的明细" })).getByRole("button", { name: /^房费/ }));

    await waitFor(() => expect(pressedView()).toBe("时间线"));
  });

  it("有没排时间的事：中间下面写还有多少没排", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      const result = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day", duration: 90 });
      if (!result.ok) throw new Error("建块失败");
    });

    const box = await card();

    expect(box.textContent).toContain("还有 1.5 小时没排");
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

    const box = await card();
    expect(box.querySelector("[data-money-note]")?.textContent).toBe(
      "只算已填的 1 笔，还有 1 笔没填 · 另有 1 件事还没填开销",
    );

    await user.click(within(box).getByRole("button", { name: /^不属于任何一天/ }));
    const editor = within(box).getByRole("group", { name: "不属于任何一天的开销" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的说明" }), "签证");
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "600{Enter}");

    await waitFor(async () =>
      expect(within(await card()).getByRole("button", { name: /^不属于任何一天/ }).textContent).toContain("¥600"),
    );
  });

  it("待定、完成几件写在卡片里", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      timed(plan, library, oct1!, "午饭", "food", 720, 60);
      if (!setBlockMark(plan, [lake], "done").ok) throw new Error("标完成失败");
    });

    const box = await card();

    expect(box.querySelector("[data-check-line]")?.textContent).toBe("完成 1 件，共 2 件");
    // 环只算没被筛掉的：这里没筛，完成的照样算
    expect(labels(box)).toEqual(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  });

  it("一分钱都没填：中间那行写出来，不画外圈", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      money(plan, library, "门票", null, "sight", [lake]);
    });

    const box = await card();

    expect(center(box).money).toBe("—");
    expect(box.textContent).toContain("还没有填了金额的开销");
    expect(center(box).time).toBe("3 小时");
  });

  it("总览里只有这一张卡片", async () => {
    await openStoredPlan(trip);

    await showView("总览");

    expect(screen.queryByRole("region", { name: "每天" })).toBeNull();
    expect(screen.queryByRole("region", { name: "占比" })).toBeNull();
    expect(screen.queryByRole("region", { name: "开销总览" })).toBeNull();
    expect(screen.queryByRole("region", { name: "时间总览" })).toBeNull();
  });
});
