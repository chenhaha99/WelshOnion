// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, createPlan as writePlanDocs, setDays, setPlanSettings, touchPlan } from "@welshonion/core";
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
  /** 建好天以后往里加事：拿到每天的 id */
  fill?: (plan: Y.Doc, library: Y.Doc, baseIds: string[]) => void;
}

async function storePlan(options: StoredPlan): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name: options.name, now: options.lastOpened });
  if (options.days) {
    const days = setDays(plan.doc, { startDate: options.days.start, count: options.days.count, tz: "Asia/Shanghai" });
    if (!days.ok) throw new Error("建天失败");
    options.fill?.(plan.doc, library.doc, days.value.baseIds);
  }
  if (options.travelers) setPlanSettings(plan.doc, { traveler_count: options.travelers });
  touchPlan(library.doc, plan.doc, options.lastOpened);
  await plan.close();
  await library.close();
  return plan.planId;
}

// 「现在」是 test-render 里的 NOW：2026-09-14 北京时间 18:00

/** 卡片名按页面上的顺序（卡片名是三级标题，组名是二级） */
async function cardNames(): Promise<string[]> {
  const headings = await screen.findAllByRole("heading", { level: 3 });
  return headings.map((heading) => heading.textContent ?? "");
}

function cardOf(name: string): HTMLElement {
  return screen.getByRole("heading", { name, level: 3 }).closest("li")!;
}

async function findCard(name: string): Promise<HTMLElement> {
  return (await screen.findByRole("heading", { name, level: 3 })).closest("li")!;
}

function moreButtonOf(name: string): HTMLElement {
  return within(cardOf(name)).getByRole("button", { name: `「${name}」的操作` });
}

/** 点卡片右上的「⋯」，再点菜单里的一项 */
async function chooseAction(user: ReturnType<typeof userEvent.setup>, name: string, item: "复制…" | "删除…") {
  await findCard(name);
  await user.click(moreButtonOf(name));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: item }));
}

describe("按时间分组", () => {
  it("最上面是下一趟，其余即将出发的在组里，已结束的收起", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "圣诞", lastOpened: "2026-09-10T08:00:00.000Z", days: { start: "2026-12-24", count: 3 } });
    await storePlan({ name: "国庆", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    await storePlan({ name: "暑假", lastOpened: "2026-09-12T08:00:00.000Z", days: { start: "2026-08-18", count: 3 } });
    renderApp("#/");

    const next = await screen.findByRole("region", { name: "下一趟" });
    expect(within(next).getByRole("heading", { level: 3 }).textContent).toBe("国庆");
    expect(within(next).getByText("下一趟")).toBeTruthy();
    expect(within(next).getByText("还有 17 天出发")).toBeTruthy();

    const upcoming = screen.getByRole("region", { name: "即将出发" });
    expect(within(upcoming).getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent)).toEqual(["圣诞"]);

    const past = screen.getByRole("region", { name: "已结束" });
    const toggle = within(past).getByRole("button", { name: /已结束 · 1/ });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading", { name: "暑假", level: 3 })).toBeNull();

    await user.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(within(past).getByRole("heading", { name: "暑假", level: 3 })).toBeTruthy();
    expect(await cardNames()).toEqual(["国庆", "圣诞", "暑假"]);
  });

  it("明天出发", async () => {
    await storePlan({ name: "秋游", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-09-15", count: 2 } });
    renderApp("#/");

    const next = await screen.findByRole("region", { name: "下一趟" });
    expect(within(next).getByText("明天出发")).toBeTruthy();
  });

  it("进行中：写「正在进行」、第几天，和今天稍后的下一件（停留不算）", async () => {
    await storePlan({
      name: "杭州",
      lastOpened: "2026-09-01T08:00:00.000Z",
      days: { start: "2026-09-13", count: 3 },
      fill: (plan, library, [, sep14]) => {
        addBlock(plan, library, { baseId: sep14!, kindId: "sight", title: "灵隐寺", minute: 540, duration: 120 });
        addBlock(plan, library, { baseId: sep14!, kindId: "stay", title: "西湖边的酒店", minute: 1140, duration: 600 });
        addBlock(plan, library, { baseId: sep14!, kindId: "sight", title: "夜游西湖", minute: 1200, duration: 60 });
      },
    });
    await storePlan({ name: "国庆", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    renderApp("#/");

    const next = await screen.findByRole("region", { name: "下一趟" });
    expect(within(next).getByRole("heading", { level: 3 }).textContent).toBe("杭州");
    expect(within(next).getByText("正在进行")).toBeTruthy();
    expect(within(next).getByText("第 2 天，共 3 天")).toBeTruthy();
    expect(await within(next).findByText("下一件 20:00 夜游西湖")).toBeTruthy();
    expect(within(next).queryByText(/西湖边的酒店|灵隐寺/)).toBeNull();
    // 这一趟不在下面的组里重复；国庆进了即将出发
    expect(screen.queryByRole("region", { name: "进行中" })).toBeNull();
    expect(within(screen.getByRole("region", { name: "即将出发" })).getByRole("heading", { name: "国庆", level: 3 })).toBeTruthy();
  });

  it("今天没有排上时间的事了：不写下一件", async () => {
    await storePlan({
      name: "杭州",
      lastOpened: "2026-09-01T08:00:00.000Z",
      days: { start: "2026-09-13", count: 3 },
      fill: (plan, library, [, sep14]) => {
        addBlock(plan, library, { baseId: sep14!, kindId: "sight", title: "灵隐寺", minute: 540, duration: 120 });
      },
    });
    renderApp("#/");

    const next = await screen.findByRole("region", { name: "下一趟" });
    await waitFor(() => expect(cardOf("杭州").querySelector(".plan-thumb-bar")).not.toBeNull());
    expect(within(next).queryByText(/下一件/)).toBeNull();
  });
});

describe("迷你时间线", () => {
  it("有排上时间的事：画出色块", async () => {
    await storePlan({
      name: "关西 10 天",
      lastOpened: "2026-09-01T08:00:00.000Z",
      days: { start: "2026-10-01", count: 3 },
      fill: (plan, library, [oct1]) => {
        addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "清水寺", minute: 540, duration: 120 });
      },
    });
    renderApp("#/");

    await findCard("关西 10 天");
    await waitFor(() => expect(cardOf("关西 10 天").querySelectorAll(".plan-thumb-bar")).toHaveLength(1));
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
    const card = await findCard("国庆中秋 · 华东自驾");
    // 摘要按「 · 」分成几段不换行的片段，读整行的字
    expect([...card.querySelectorAll("p")].map((line) => line.textContent)).toContain("9.24 – 10.2 · 9 天 · 3 人");
  });
});

describe("一个计划都没有时", () => {
  it("第一次用", async () => {
    renderApp("#/");
    expect(await screen.findByRole("button", { name: "新建第一个计划" })).toBeTruthy();
    // 口号和它下面那一句（和官网首屏一样）
    expect(screen.getByText("流光可见，行程有度")).toBeTruthy();
    expect(screen.getByText("每件事按时长排在时间线上，出发前哪里赶、哪里空，一眼就知道")).toBeTruthy();
  });
});

describe("示例计划（照 Final Cut Pro 的演示项目）", () => {
  it("一个计划都没有时点「看看示例计划」：进入一趟排好的广州三日游，回到首页它是「下一趟」，挂着「示例」角标", async () => {
    const user = userEvent.setup();
    renderApp("#/");

    await user.click(await screen.findByRole("button", { name: "看看示例计划" }));

    // 计划页标题是一个能点了改名的按钮
    expect(await screen.findByRole("button", { name: "示例：广州三日游" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    const next = await screen.findByRole("region", { name: "下一趟" });
    expect(within(next).getByRole("heading", { name: "示例：广州三日游", level: 3 })).toBeTruthy();
    expect(within(next).getByText("示例")).toBeTruthy();
    // 今天 9.14（周一），示例从至少一周后的第一个周五 9.25 出发
    expect(within(next).getByText("还有 11 天出发")).toBeTruthy();
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
  it("点卡片进入计划", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");

    await user.click(within(await findCard("A")).getByRole("link"));
    expect(await screen.findByRole("heading", { name: "A", level: 1 })).toBeTruthy();
  });
});

describe("「⋯」菜单", () => {
  it("卡片上右键（手机长按）打开同一个菜单", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");

    fireEvent.contextMenu(await findCard("A"));
    const menu = await screen.findByRole("menu");
    expect(moreButtonOf("A").getAttribute("aria-expanded")).toBe("true");
    expect(within(menu).getAllByRole("menuitem").map((item) => item.textContent)).toEqual(["复制…", "删除…"]);

    await user.click(within(menu).getByRole("menuitem", { name: "删除…" }));
    expect(within(cardOf("A")).getByText(/删了找不回来/)).toBeTruthy();
  });
});

describe("删除要再确认一次", () => {
  it("确认后删掉", async () => {
    const user = userEvent.setup();
    const planA = await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    await storePlan({ name: "B", lastOpened: "2026-09-10T08:00:00.000Z" });
    renderApp("#/");
    await cardNames();

    await chooseAction(user, "A", "删除…");
    await user.click(within(cardOf("A")).getByRole("button", { name: "确认删除" }));

    await expect.poll(() => screen.queryByRole("heading", { name: "A", level: 3 })).toBeNull();
    expect(await cardNames()).toEqual(["B"]);
    expect(await storedDbNames()).not.toContain(planDbName(planA));
  });

  it("取消不删，焦点回到「⋯」", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "A", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");
    await cardNames();

    await chooseAction(user, "A", "删除…");
    expect(within(cardOf("A")).getByText(/删了找不回来/)).toBeTruthy();
    await user.click(within(cardOf("A")).getByRole("button", { name: "取消" }));

    expect(within(cardOf("A")).queryByRole("button", { name: "确认删除" })).toBeNull();
    expect(await cardNames()).toEqual(["A"]);
    await waitFor(() => expect(document.activeElement).toBe(moreButtonOf("A")));
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
    expect(await screen.findByRole("heading", { name: "杭州", level: 3 })).toBeTruthy();
  });
});

describe("复制计划", () => {
  it("复制到新的日期：进入新计划，回到列表两张卡都在", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "关西 10 天", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    renderApp("#/");

    await chooseAction(user, "关西 10 天", "复制…");
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

  it("取消不复制：卡片恢复原样，焦点回到「⋯」", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "关西 10 天", lastOpened: "2026-09-01T08:00:00.000Z", days: { start: "2026-10-01", count: 3 } });
    renderApp("#/");

    await chooseAction(user, "关西 10 天", "复制…");
    await user.click(within(cardOf("关西 10 天")).getByRole("button", { name: "取消" }));

    expect(await cardNames()).toEqual(["关西 10 天"]);
    expect(within(cardOf("关西 10 天")).queryByLabelText("名字")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(moreButtonOf("关西 10 天")));
  });

  it("没有天的计划不问日期", async () => {
    const user = userEvent.setup();
    await storePlan({ name: "未命名计划", lastOpened: "2026-09-01T08:00:00.000Z" });
    renderApp("#/");

    await chooseAction(user, "未命名计划", "复制…");
    const card = cardOf("未命名计划");
    expect(within(card).getByLabelText("名字")).toBeTruthy();
    expect(within(card).queryByLabelText("新的出发日期")).toBeNull();
  });
});
