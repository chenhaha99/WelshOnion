// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setDays, touchPlan } from "@welshonion/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan } from "../storage/plans";
import { releaseAll } from "../storage/test-helpers";

// 「现在」是 test-render 里的 2026-09-14（北京时间周一）

beforeEach(() => localStorage.clear());

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 在本机存一个计划：给了 start 和 count 就从那天起排几天。 */
async function storePlan(name: string, days?: { start: string; count: number }): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name, now: "2026-09-01T00:00:00.000Z" });
  if (days) setDays(plan.doc, { startDate: days.start, count: days.count, tz: "Asia/Shanghai" });
  touchPlan(library.doc, plan.doc, "2026-09-01T00:00:00.000Z");
  await plan.close();
  await library.close();
  return plan.planId;
}

async function views(): Promise<HTMLElement> {
  return screen.findByRole("group", { name: "计划怎么看" });
}

async function openCalendar(): Promise<HTMLElement> {
  const user = userEvent.setup();
  await user.click(within(await views()).getByRole("button", { name: "日历" }));
  return screen.findByRole("region", { name: "日历" });
}

describe("列表和日历切换着看", () => {
  it("默认是列表", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    await storePlan("以后再说");
    renderApp("#/");

    const group = await views();
    expect(within(group).getByRole("button", { name: "列表", pressed: true })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "秋游", level: 3 })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "日历" })).toBeNull();
  });

  it("记住上次看的", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    await openCalendar();
    cleanup();

    renderApp("#/");

    expect(within(await views()).getByRole("button", { name: "日历", pressed: true })).toBeTruthy();
    expect(await screen.findByRole("region", { name: "日历" })).toBeTruthy();
  });

  it("一个计划都没有时没有这组按钮", async () => {
    renderApp("#/");

    await screen.findByRole("button", { name: "新建第一个计划" });
    expect(screen.queryByRole("group", { name: "计划怎么看" })).toBeNull();
  });
});

describe("翻月", () => {
  it("打开是这个月，今天标出来；翻到下个月出现「本月」，点了回来", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    const user = userEvent.setup();
    const calendar = await openCalendar();

    expect(within(calendar).getByRole("heading", { name: "2026 年 9 月" })).toBeTruthy();
    expect(calendar.querySelectorAll("[data-week]")).toHaveLength(5);
    expect(calendar.querySelector('[aria-current="date"]')?.getAttribute("data-day")).toBe("2026-09-14");
    expect(within(calendar).queryByRole("button", { name: "本月" })).toBeNull();

    await user.click(within(calendar).getByRole("button", { name: "下个月" }));
    expect(within(calendar).getByRole("heading", { name: "2026 年 10 月" })).toBeTruthy();

    await user.click(within(calendar).getByRole("button", { name: "本月" }));
    expect(within(calendar).getByRole("heading", { name: "2026 年 9 月" })).toBeTruthy();
    expect(within(calendar).queryByRole("button", { name: "本月" })).toBeNull();
  });
});

describe("计划画成横条", () => {
  it("跨周折成两段，读屏名是「计划名 · 卡片那一行」，前一段右平、后一段左平", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    const calendar = await openCalendar();

    const bars = within(calendar).getAllByRole("link", { name: "秋游 · 9.18 – 9.22 · 5 天 · 1 人" });
    expect(bars).toHaveLength(2);
    expect(bars.map((bar) => bar.textContent)).toEqual(["秋游", "秋游"]);
    expect(bars[0]!.getAttribute("data-continues-after")).toBe("true");
    expect(bars[1]!.getAttribute("data-continues-before")).toBe("true");
  });

  it("重叠的分道，没有撞期提示", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    await storePlan("周末露营", { start: "2026-09-19", count: 2 });
    renderApp("#/");
    const calendar = await openCalendar();

    const week = calendar.querySelectorAll<HTMLElement>("[data-week]")[2]!;
    const lanes = [...week.querySelectorAll("a")].map((bar) => `${bar.textContent} ${bar.getAttribute("data-lane")}`);
    expect(lanes).toEqual(["秋游 1", "周末露营 2"]);
    expect(calendar.textContent).not.toMatch(/撞|冲突|重叠/);
  });

  it("点横条打开那个计划", async () => {
    const planId = await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    const user = userEvent.setup();
    const calendar = await openCalendar();

    await user.click(within(calendar).getAllByRole("link", { name: /^秋游 · / })[0]!);

    await waitFor(() => expect(window.location.hash).toBe(`#/plans/${planId}`));
  });
});

describe("还没排日期的计划", () => {
  it("列在月历下面，点了打开；都排了日期就不写", async () => {
    const undatedId = await storePlan("以后再说");
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    const calendar = await openCalendar();

    const line = within(calendar).getByText("还没排日期：").closest("p")!;
    const link = within(line).getByRole("link", { name: "以后再说" });
    expect(link.getAttribute("href")).toBe(`#/plans/${undatedId}`);
  });

  it("都排了日期就不写这一行", async () => {
    await storePlan("秋游", { start: "2026-09-18", count: 5 });
    renderApp("#/");
    const calendar = await openCalendar();

    expect(within(calendar).queryByText("还没排日期：")).toBeNull();
  });
});
