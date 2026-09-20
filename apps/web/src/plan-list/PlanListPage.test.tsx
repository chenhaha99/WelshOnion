// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createPlan as writePlanDocs, setDays, setPlanSettings, touchPlan } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { NOW, renderApp } from "../app/test-render";
import { dayLabels } from "../plan/test-helpers";
import { openLibrary } from "../storage/library";
import { planDbName } from "../storage/names";
import { createPlan } from "../storage/plans";
import { releaseAll, storedDbNames, track } from "../storage/test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

interface StoredPlan {
  name: string;
  lastOpened: string;
  days?: { start: string; count: number };
  travelers?: number;
}

async function storePlan(options: StoredPlan): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name: options.name, now: options.lastOpened });
  if (options.days) setDays(plan.doc, { startDate: options.days.start, count: options.days.count, tz: "Asia/Shanghai" });
  if (options.travelers) setPlanSettings(plan.doc, { traveler_count: options.travelers });
  touchPlan(library.doc, plan.doc, options.lastOpened);
  await plan.close();
  await library.close();
  return plan.planId;
}

async function cardNames(): Promise<string[]> {
  const headings = await screen.findAllByRole("heading", { level: 2 });
  return headings.map((heading) => heading.textContent ?? "");
}

function cardOf(name: string): HTMLElement {
  return screen.getByRole("heading", { name, level: 2 }).closest("li")!;
}

describe("按最近打开排序", () => {
  it("最近打开的排最前", async () => {
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    await storePlan({ name: "B", lastOpened: "2026-09-10T08:00:00.000Z" });
    await storePlan({ name: "C", lastOpened: "2026-09-05T08:00:00.000Z" });

    renderApp("#/");
    expect(await cardNames()).toEqual(["B", "C", "A"]);
  });
});

describe("卡片内容", () => {
  it("今年的计划", async () => {
    await storePlan({
      name: "国庆中秋 · 华东自驾",
      lastOpened: "2026-09-01T08:00:00.000Z",
      days: { start: "2026-09-24", count: 9 },
      travelers: 3,
    });

    renderApp("#/");
    const card = (await screen.findByRole("heading", { name: "国庆中秋 · 华东自驾", level: 2 })).closest("li")!;
    // 摘要按「 · 」分成几段不换行的片段，读整行的字
    expect(card.querySelector("p")?.textContent).toBe("9.24 – 10.2 · 9 天 · 3 人");
  });
});

describe("一个计划都没有时", () => {
  it("第一次用", async () => {
    renderApp("#/");
    expect(await screen.findByRole("button", { name: "新建第一个计划" })).toBeTruthy();
    expect(screen.getByText(/把旅行排进时间线/)).toBeTruthy();
  });
});

describe("新建计划", () => {
  it("填了名字：按回车，进入计划，回到列表能看到", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "新建第一个计划" }));
    await user.type(screen.getByRole("textbox", { name: "计划名" }), "关西 10 天{Enter}");

    expect(await screen.findByRole("heading", { name: "关西 10 天", level: 1 })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    expect(await cardNames()).toEqual(["关西 10 天"]);
  });

  it("不填名字：叫「未命名计划」", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "新建第一个计划" }));
    await user.click(screen.getByRole("button", { name: "新建" }));

    expect(await screen.findByRole("heading", { name: "未命名计划", level: 1 })).toBeTruthy();
  });

  it("取消：输入框收起，没有新建", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "新建计划" }));
    await user.click(screen.getByRole("button", { name: "取消" }));

    expect(screen.queryByRole("textbox", { name: "计划名" })).toBeNull();
    expect(screen.getByRole("button", { name: "新建计划" })).toBeTruthy();
    expect(await cardNames()).toEqual(["A"]);
  });
});

describe("打开计划", () => {
  it("打开后排到最前", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    await storePlan({ name: "B", lastOpened: "2026-09-10T08:00:00.000Z" });
    renderApp("#/");
    expect(await cardNames()).toEqual(["B", "A"]);

    await user.click(within(cardOf("A")).getByRole("link"));
    await screen.findByRole("heading", { name: "A", level: 1 });
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    expect(await cardNames()).toEqual(["A", "B"]);
  });
});

describe("删除要再确认一次", () => {
  it("确认后删掉", async () => {
    const user = userEvent.setup();
    const planA = await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    await storePlan({ name: "B", lastOpened: "2026-09-10T08:00:00.000Z" });
    renderApp("#/");
    await cardNames();

    await user.click(within(cardOf("A")).getByRole("button", { name: "删除" }));
    await user.click(within(cardOf("A")).getByRole("button", { name: "确认删除" }));

    await expect.poll(() => screen.queryByRole("heading", { name: "A", level: 2 })).toBeNull();
    expect(await cardNames()).toEqual(["B"]);
    expect(await storedDbNames()).not.toContain(planDbName(planA));
  });

  it("取消不删", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");
    await cardNames();

    await user.click(within(cardOf("A")).getByRole("button", { name: "删除" }));
    expect(within(cardOf("A")).getByText(/删了找不回来/)).toBeTruthy();
    await user.click(within(cardOf("A")).getByRole("button", { name: "取消" }));

    expect(within(cardOf("A")).queryByRole("button", { name: "确认删除" })).toBeNull();
    expect(within(cardOf("A")).getByRole("button", { name: "删除" })).toBeTruthy();
    expect(await cardNames()).toEqual(["A"]);
  });
});

describe("列表跟着本机实际情况变", () => {
  it("打开时对账：索引里有、本机没有文档的不显示", async () => {
    const library = await openLibrary();
    writePlanDocs(library.doc, new Y.Doc(), { planId: "q", name: "幽灵", now: NOW });
    await library.close();

    renderApp("#/");
    expect(await screen.findByRole("button", { name: "新建第一个计划" })).toBeTruthy();
    expect(screen.queryByText("幽灵")).toBeNull();
  });

  it("别的标签页新建了计划：不刷新就出现", async () => {
    renderApp("#/");
    await screen.findByRole("button", { name: "新建第一个计划" });

    const otherTab = track(await openLibrary());
    track(await createPlan(otherTab.doc, { name: "杭州", now: NOW }));
    expect(await screen.findByRole("heading", { name: "杭州", level: 2 })).toBeTruthy();
  });
});

describe("复制计划", () => {
  async function findCard(name: string): Promise<HTMLElement> {
    return (await screen.findByRole("heading", { name, level: 2 })).closest("li")!;
  }

  it("复制到新的日期：进入新计划，回到列表两张卡都在", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "关西 10 天", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    renderApp("#/");

    await user.click(within(await findCard("关西 10 天")).getByRole("button", { name: "复制" }));
    const card = cardOf("关西 10 天");
    expect((within(card).getByLabelText("名字") as HTMLInputElement).value).toBe("关西 10 天 副本");
    const date = within(card).getByLabelText("新的出发日期") as HTMLInputElement;
    expect(date.value).toBe("2026-09-14");
    fireEvent.change(date, { target: { value: "2027-04-29" } });
    await user.click(within(card).getByRole("button", { name: "复制" }));

    expect(await screen.findByRole("button", { name: "关西 10 天 副本" })).toBeTruthy();
    await waitFor(async () =>
      expect(await dayLabels()).toEqual([
        expect.stringContaining("4.29"),
        expect.stringContaining("4.30"),
        expect.stringContaining("5.1"),
      ]),
    );
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    await waitFor(async () => expect((await cardNames()).sort()).toEqual(["关西 10 天", "关西 10 天 副本"].sort()));
  });

  it("取消不复制：卡片恢复原样，焦点回到「复制」", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "关西 10 天", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    renderApp("#/");

    await user.click(within(await findCard("关西 10 天")).getByRole("button", { name: "复制" }));
    await user.click(within(cardOf("关西 10 天")).getByRole("button", { name: "取消" }));

    expect(await cardNames()).toEqual(["关西 10 天"]);
    expect(within(cardOf("关西 10 天")).queryByLabelText("名字")).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(within(cardOf("关西 10 天")).getByRole("button", { name: "复制" })),
    );
  });

  it("没有天的计划不问日期", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "未命名计划", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");

    await user.click(within(await findCard("未命名计划")).getByRole("button", { name: "复制" }));
    const card = cardOf("未命名计划");
    expect(within(card).getByLabelText("名字")).toBeTruthy();
    expect(within(card).queryByLabelText("新的出发日期")).toBeNull();
  });
});
