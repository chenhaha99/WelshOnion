import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, DAY1, DAY2, DAY3, newPlan, quickBar, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机上打开展开第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");

/** 元素整个在浏览器窗口里（上下左右都没出去）。 */
async function expectInWindow(page: Page, locator: Locator): Promise<void> {
  const rect = (await locator.boundingBox())!;
  const size = page.viewportSize()!;
  expect(rect.x).toBeGreaterThanOrEqual(0);
  expect(rect.y).toBeGreaterThanOrEqual(0);
  expect(rect.x + rect.width).toBeLessThanOrEqual(size.width);
  expect(rect.y + rect.height).toBeLessThanOrEqual(size.height);
}

async function searchFor(page: Page, query: string): Promise<Locator> {
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "搜索" });
  await panel.getByRole("searchbox", { name: "搜索这趟计划" }).fill(query);
  return panel;
}

test("电脑上：放大到 400% 搜一件 → 跳过去选中、横条在屏幕里 → 日程里跳到那一行", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 3);
  await addBlocks(page, page.getByRole("table", { name: DAY1 }), ["西湖"]);
  await schedule(page, page.getByRole("table", { name: DAY1 }), "西湖", "09:00", "1");
  await addBlocks(page, page.getByRole("table", { name: DAY2 }), ["灵隐寺"]);
  await addBlocks(page, page.getByRole("table", { name: DAY3 }), ["西湖夜游"]);
  await schedule(page, page.getByRole("table", { name: DAY3 }), "西湖夜游", "21:00", "2");

  // 时间线放大到 400%：21:00 的块在横向滚动框外面
  await showView(page, "时间线");
  await page.getByRole("slider", { name: "横向放大" }).fill("400");
  const day3 = timelineRow(page, "10.3");
  const night = segment(day3, "西湖夜游");

  // 搜「西湖」：两条，按天排，写在哪天几点
  const panel = await searchFor(page, "西湖");
  await expect(panel.getByText("找到 2 件")).toBeVisible();
  await expect(panel.getByRole("list", { name: "搜索结果" }).getByRole("button")).toHaveText([
    "西湖第 1 天 · 10.1 周四 · 09:00–10:00",
    "西湖夜游第 3 天 · 10.3 周六 · 21:00–23:00",
  ]);
  await shot(page, "01-search-panel");

  // 点「西湖夜游」：面板关掉，选中、出快捷条，横条滚进了屏幕，焦点在它上面
  await panel.getByRole("button", { name: /^西湖夜游/ }).click();
  await expect(panel).toBeHidden();
  const bar = night.getByRole("button", { name: /^西湖夜游 / });
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await expect(quickBar(page, "西湖夜游")).toBeVisible();
  await expect(bar).toBeFocused();
  await expectInWindow(page, bar);
  // 只横着滚过去，没把时间线竖着滚：最上面钟点那一行还在
  expect(await page.locator("[data-timeline-scroll]").evaluate((element) => element.scrollTop)).toBe(0);
  await expect(page.locator("[data-hour-tick]").filter({ hasText: /^22$/ })).toBeInViewport();
  await shot(page, "02-jumped-timeline");

  // 日程里：只用键盘搜，跳到那一行的「这件事的操作」
  await showView(page, "日程");
  await page.getByRole("button", { name: "搜索", exact: true }).click();
  await page.keyboard.type("灵隐");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const row = page.getByRole("table", { name: DAY2 }).locator("tr[data-block-id]").first();
  await expect(row.getByRole("button", { name: "这件事的操作" })).toBeFocused();
  await expectInWindow(page, row.getByRole("button", { name: "这件事的操作" }));

  expect(errors).toEqual([]);
});

test("手机上：页顶四个图标放得下 → 时间线展开着第 1 天，搜第 3 天的事 → 展开那天、选中", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 3, { width: 390, height: 844 });
  await addBlocks(page, page.getByRole("table", { name: DAY3 }), ["西湖夜游"]);
  await schedule(page, page.getByRole("table", { name: DAY3 }), "西湖夜游", "19:00", "2");

  // 页顶：滚回页面最上面，计划名和四个图标都整个在屏幕里（前面加事时页面滚下去了）
  await page.evaluate(() => window.scrollTo(0, 0));
  const top = page.locator("[data-top-row]");
  await expectInWindow(page, top.getByRole("heading"));
  for (const name of ["搜索", "计划设置", "撤销", "重做"]) {
    await expectInWindow(page, top.getByRole("button", { name, exact: true }));
  }

  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const days = timeline.getByRole("list", { name: "每天" }).getByRole("listitem");
  await expect(days.nth(0)).toHaveAttribute("data-open", "true");
  await expect(days.nth(2)).not.toHaveAttribute("data-open", "true");

  // 面板占满屏幕
  const panel = await searchFor(page, "夜游");
  const rect = (await panel.boundingBox())!;
  expect(Math.round(rect.width)).toBe(390);
  expect(Math.round(rect.height)).toBe(844);
  await shot(page, "03-phone-search");

  await panel.getByRole("button", { name: /^西湖夜游/ }).click();
  // 第 3 天展开（一次只展开一天），那件事的色块选中、在屏幕里，底部浮出快捷条
  await expect(days.nth(2)).toHaveAttribute("aria-label", "第 3 天 · 10.3 周六");
  await expect(days.nth(2)).toHaveAttribute("data-open", "true");
  await expect(days.nth(0)).not.toHaveAttribute("data-open", "true");
  const bar = days.nth(2).getByRole("button", { name: /^西湖夜游 / });
  await expect(bar).toHaveAttribute("aria-pressed", "true");
  await expect(bar).toBeInViewport();
  await expect(quickBar(page, "西湖夜游")).toBeVisible();
  await shot(page, "04-phone-jumped");

  expect(errors).toEqual([]);
});
