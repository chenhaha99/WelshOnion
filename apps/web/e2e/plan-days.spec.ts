import { expect, test } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("几天：新建 → 定 3 天 → 键盘插天 → 撤销重做 → 改时区 → 设置 → 回列表", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆华东");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 2, name: "几天？" })).toBeVisible();
  await shot(page, "01-ask-days");

  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("3");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");
  const list = page.getByRole("list", { name: "每天" });
  const rows = list.getByRole("listitem");
  await expect(rows).toHaveCount(3);
  await shot(page, "02-three-days");

  // 只用键盘：打开第一天的菜单，下移到「在下面插一天」，回车
  const firstMenuButton = rows.first().getByRole("button", { name: "这天的操作" });
  await firstMenuButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitem", { name: "在上面插一天" })).toBeFocused();
  await shot(page, "03-menu-open");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "在下面插一天" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(rows).toHaveCount(4);
  await expect(firstMenuButton).toBeFocused();

  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(3);
  await page.getByRole("button", { name: "重做" }).click();
  await expect(rows).toHaveCount(4);

  // 最后一天改到东京
  const lastRow = rows.last();
  await lastRow.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "改时区…" }).click();
  await lastRow.getByRole("combobox", { name: "时区" }).selectOption("Asia/Tokyo");
  await expect(lastRow.locator("[data-day-label]")).toHaveText("第 4 天 · 10.4 周日 · 东京 +1h");
  await expect(rows.first().locator("[data-day-label]")).toHaveText("第 1 天 · 10.1 周四 · 北京");
  await shot(page, "04-timezone");

  // 设置抽屉：打开时焦点在名字；人数填错有说明；Esc 关掉后焦点回到标题
  await page.getByRole("button", { name: "国庆华东" }).click();
  const drawer = page.getByRole("dialog", { name: "计划设置" });
  await expect(drawer.getByLabel("名字")).toBeFocused();
  await drawer.getByLabel("名字").fill("国庆中秋 · 华东自驾");
  await page.keyboard.press("Enter");
  await drawer.getByLabel("人数").fill("0");
  await page.keyboard.press("Enter");
  await expect(drawer.getByText("人数要是正整数")).toBeVisible();
  await shot(page, "05-drawer-error");
  await drawer.getByLabel("人数").fill("3");
  await page.keyboard.press("Enter");
  await drawer.getByLabel("每公里成本（元）").fill("0.8");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("button", { name: "国庆中秋 · 华东自驾" })).toBeFocused();

  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(page.getByRole("heading", { level: 3, name: "国庆中秋 · 华东自驾" })).toBeVisible();
  await expect(page.getByText("10.1 – 10.4 · 4 天 · 3 人")).toBeVisible();
  await shot(page, "06-list-updated");

  await page.getByRole("heading", { level: 3, name: "国庆中秋 · 华东自驾" }).click();
  await expect(list).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "07-mobile-days");
  await rows.first().getByRole("button", { name: "这天的操作" }).click();
  await shot(page, "08-mobile-menu");

  expect(errors).toEqual([]);
});
