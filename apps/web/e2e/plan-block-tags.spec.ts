import { expect, test, type Locator, type Page } from "@playwright/test";
import {
  addBlocks,
  DAY1,
  newPlan,
  openPlanSettings,
  quickBar,
  rowOf,
  schedule,
  segment,
  showView,
  timelineRow,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机竖排打开是第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");

/** 在打开着的「选择标签」里新建一个标签（建好就挂上）。 */
async function createTag(page: Page, name: string): Promise<void> {
  const picker = page.getByRole("dialog", { name: "选择标签" });
  await picker.getByRole("button", { name: "+ 新建标签" }).click();
  await picker.getByRole("textbox", { name: "名字" }).fill(name);
  await picker.getByRole("button", { name: "确定", exact: true }).click();
  await expect(picker.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
}

async function box(locator: Locator) {
  return (await locator.boundingBox())!;
}

test("电脑上：快捷条里新建两个标签挂上 → 块的上边挂着两条书签、标题在书签下面 → 日程里挂 → 按标签筛 → 设置里改色、删除", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖边走一整圈", "灵隐寺"]);
  await schedule(page, table, "西湖边走一整圈", "09:00", "2");
  await schedule(page, table, "灵隐寺", "14:00", "2");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖边走一整圈").getByRole("button", { name: /^西湖边走一整圈 / });

  // 快捷条「类型」后面是「标签：没有」；点开新建两个，面板一直开着
  await lake.click();
  await quickBar(page, "西湖边走一整圈").getByRole("button", { name: "标签：没有" }).click();
  await createTag(page, "必去");
  await createTag(page, "下雨也能去");
  await shot(page, "01-tag-picker");
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "西湖边走一整圈").getByRole("button", { name: "标签：必去、下雨也能去" })).toBeVisible();
  await page.keyboard.press("Escape");

  // 块的上边挂着两条书签、靠右，鼠标停上去写名字；标题在书签栏下面，不和书签同一行
  const dots = lake.locator("[data-block-tags]");
  await expect(dots.locator("[data-tag-ribbon]")).toHaveCount(2);
  await expect(dots).toHaveAttribute("title", "必去、下雨也能去");
  await expect(lake).toHaveAttribute("aria-label", "西湖边走一整圈 09:00–11:00 · 必去、下雨也能去");
  const barBox = await box(lake);
  const dotsBox = await box(dots);
  expect(barBox.x + barBox.width - (dotsBox.x + dotsBox.width)).toBeLessThan(6);
  expect(dotsBox.y - barBox.y).toBeLessThanOrEqual(1.5);
  const titleBox = await box(lake.locator("[data-bar-title]"));
  expect(titleBox.y).toBeGreaterThanOrEqual(dotsBox.y + dotsBox.height - 0.5);
  await shot(page, "02-ribbons-on-bar");

  // 日程里「灵隐寺」那一行的「标签」列：挂上「必去」
  const temple = await rowOf(table, "灵隐寺");
  await temple.getByRole("button", { name: "标签：没有" }).click();
  await page.getByRole("dialog", { name: "选择标签" }).getByRole("button", { name: "必去", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(temple.getByRole("button", { name: "标签：必去" })).toContainText("必去");
  await shot(page, "03-list-column");

  // 按标签筛：只按「下雨也能去」，时间线上只剩西湖；全部标签
  await showView(page, "时间线");
  const tags = page.getByRole("group", { name: "按标签筛选" });
  await expect(tags.getByRole("button")).toHaveText(["必去", "下雨也能去"]);
  await tags.getByRole("button", { name: "下雨也能去" }).click();
  await expect(segment(day1, "灵隐寺")).toHaveCount(0);
  await expect(segment(day1, "西湖边走一整圈")).toHaveCount(1);
  await tags.getByRole("button", { name: "全部标签" }).click();
  await expect(segment(day1, "灵隐寺")).toHaveCount(1);

  // 设置里：改「必去」的颜色，块上的书签跟着变；删「下雨也能去」，西湖只剩一条书签
  const settings = await openPlanSettings(page, "标签");
  const manager = settings.getByRole("group", { name: "标签的管理" });
  await expect(manager.getByText("这个计划里 2 件在用")).toBeVisible();
  await manager.getByRole("button", { name: "改颜色：必去" }).click();
  await manager.getByRole("button", { name: "颜色 #6fa3a0" }).click();
  await manager.getByRole("button", { name: "删除：下雨也能去" }).click();
  await expect(manager.getByText("这个计划里有 1 件事挂着", { exact: false })).toBeVisible();
  await shot(page, "04-settings-delete");
  await manager.getByRole("button", { name: "删除", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(dots.locator("[data-tag-ribbon]")).toHaveCount(1);
  expect(await dots.locator("[data-tag-ribbon]").evaluate((node) => getComputedStyle(node).color)).toBe(
    "rgb(111, 163, 160)",
  );

  expect(errors).toEqual([]);
});

test("手机上：竖条选中，底部快捷条里挂标签，竖条上边挂着书签", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  const lake = page.getByRole("region", { name: "时间线" }).getByRole("button", { name: /^西湖 / });

  await lake.click();
  const tagButton = quickBar(page, "西湖").getByRole("button", { name: "标签：没有" });
  await expect(tagButton).toBeInViewport();
  await tagButton.click();
  await createTag(page, "必去");
  const picker = page.getByRole("dialog", { name: "选择标签" });
  const pickerBox = await box(picker);
  expect(pickerBox.x).toBeGreaterThanOrEqual(0);
  expect(pickerBox.x + pickerBox.width).toBeLessThanOrEqual(390);
  await shot(page, "05-phone-picker");
  await page.keyboard.press("Escape");

  const dots = lake.locator("[data-block-tags]");
  await expect(dots.locator("[data-tag-ribbon]")).toHaveCount(1);
  const barBox = await box(lake);
  const dotsBox = await box(dots);
  expect(barBox.x + barBox.width - (dotsBox.x + dotsBox.width)).toBeLessThan(6);
  expect(dotsBox.y - barBox.y).toBeLessThan(6);
  await shot(page, "06-phone-ribbons");

  expect(errors).toEqual([]);
});
