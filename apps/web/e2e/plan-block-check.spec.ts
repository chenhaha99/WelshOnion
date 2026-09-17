import { expect, test } from "@playwright/test";
import { addBlocks, DAY1, newPlan, quickBar, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机竖排打开是第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");

test("电脑上：快捷条勾一件、出角标、块不变样 → 列表里勾另一件 → 只看没勾的 → 总览写勾了几件", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "灵隐寺", "河坊街"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "灵隐寺", "14:00", "2");
  await schedule(page, day1Table, "河坊街", "19:00", "2");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖").getByRole("button", { name: /^西湖 / });

  // 快捷条第一个是「勾」：点了按下、横条右上角出角标；块的大小和边框样子都不变
  const before = (await lake.boundingBox())!;
  const borderBefore = await lake.evaluate((element) => getComputedStyle(element).borderStyle);
  await lake.click();
  const toggle = quickBar(page, "西湖").getByRole("button", { name: "勾", exact: true });
  await expect(quickBar(page, "西湖").getByRole("button").first()).toHaveAttribute("aria-label", "勾");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toBeFocused();
  await expect(lake.locator("[data-checked-mark]")).toBeVisible();
  await expect(lake).toHaveAttribute("aria-label", "西湖 09:00–12:00 · 勾了");
  const after = (await lake.boundingBox())!;
  expect([Math.round(after.x), Math.round(after.y), Math.round(after.width), Math.round(after.height)]).toEqual([
    Math.round(before.x),
    Math.round(before.y),
    Math.round(before.width),
    Math.round(before.height),
  ]);
  expect(await lake.evaluate((element) => getComputedStyle(element).borderStyle)).toBe(borderBefore);
  await page.keyboard.press("Escape");
  await shot(page, "01-checked-bar");

  // 列表里勾「河坊街」：标题前面的勾选框
  await showView(page, "列表");
  const street = day1Table.locator("tr[data-block-id]").filter({ has: page.locator('input[value="河坊街"]') });
  await street.getByRole("checkbox", { name: "勾" }).check();
  await expect(street.getByRole("checkbox", { name: "勾" })).toBeChecked();
  await expect(day1Table.locator("tr[data-block-id]").filter({ has: page.locator('input[value="西湖"]') }).getByRole("checkbox", { name: "勾" })).toBeChecked();
  await shot(page, "02-list-checkbox");

  // 只看没勾的：时间轴上只剩「灵隐寺」
  await showView(page, "时间轴");
  await page.getByRole("button", { name: "只看没勾的" }).click();
  await expect(segment(day1, "西湖")).toHaveCount(0);
  await expect(segment(day1, "河坊街")).toHaveCount(0);
  await expect(segment(day1, "灵隐寺")).toHaveCount(1);
  await page.getByRole("button", { name: "只看没勾的" }).click();

  // 总览：勾了 2 件，共 3 件
  await showView(page, "总览");
  await expect(page.getByRole("region", { name: "占比" }).getByText("勾了 2 件，共 3 件")).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：竖条选中，底部快捷条的「勾」", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const lake = timeline.getByRole("button", { name: /^西湖 / });

  await lake.click();
  const toggle = quickBar(page, "西湖").getByRole("button", { name: "勾", exact: true });
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(lake.locator("[data-checked-mark]")).toBeVisible();
  await shot(page, "03-phone-checked");

  expect(errors).toEqual([]);
});
