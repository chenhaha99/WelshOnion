import { expect, test } from "@playwright/test";
import { DAY1, DAY2, addBlocks, newPlan, pickKind, rowOf, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("一键批量：对看得见的几件一起完成 → 撤销 → 改类型 → 这天全部 → 手机", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1 = page.getByRole("table", { name: DAY1 });
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1, ["西湖", "午饭", "民宿"]);
  await addBlocks(page, day2, ["乌镇"]);
  await pickKind(page, day1, "午饭", "餐饮");
  await pickKind(page, day1, "民宿", "住宿");

  // 按钮上写看得见的件数
  const bulk = page.getByRole("button", { name: "对这 4 件事" });
  await expect(bulk).toHaveText("对这 4 件…");

  // 一起完成：四件都完成，底下出提示
  await bulk.click();
  await page.getByRole("menu").getByRole("menuitem", { name: "设成完成" }).click();
  await expect(day1.locator('tr[data-mark="done"]')).toHaveCount(3);
  await expect(day2.locator('tr[data-mark="done"]')).toHaveCount(1);
  const notice = page.getByRole("status", { name: "刚做完的提示" });
  await expect(notice).toContainText("4 件事的标记都改成了「完成」");
  await shot(page, "01-done", { screen: true });

  // 一步撤销：四件都回来
  await notice.getByRole("button", { name: "撤销" }).click();
  await expect(page.locator('tr[data-mark="done"]')).toHaveCount(0);

  // 先筛再一键：只看游玩，改成住宿，只有那两件变
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  await kinds.getByRole("button", { name: "游玩", exact: true }).click();
  await expect(page.getByRole("button", { name: "对这 2 件事" })).toBeVisible();
  await page.getByRole("button", { name: "对这 2 件事" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "改类型…" }).click();
  await shot(page, "02-submenu");
  await page.getByRole("menu").getByRole("menuitem", { name: "住宿", exact: true }).click();
  await expect(page.getByRole("status", { name: "刚做完的提示" })).toContainText("2 件事都改成了「住宿」");
  await kinds.getByRole("button", { name: "全部类型" }).click();
  await expect((await rowOf(day1, "西湖")).getByRole("button", { name: "类型：住宿" })).toBeVisible();
  await expect((await rowOf(day1, "午饭")).getByRole("button", { name: "类型：餐饮" })).toBeVisible();

  // 这天全部：只作用于 10.1（菜单按钮在这一天的组头上，不在时刻表里）
  const firstDay = page.getByRole("list", { name: "日期列表" }).getByRole("listitem").nth(0);
  await firstDay.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "这天全部…" }).click();
  await page.getByRole("menu").getByRole("menuitem", { name: "设成待定" }).click();
  await expect(day1.locator('tr[data-mark="pending"]')).toHaveCount(3);
  await expect(day2.locator('tr[data-mark="pending"]')).toHaveCount(0);

  // 手机：按钮在筛选那一排里，菜单整个在屏幕里
  await page.setViewportSize({ width: 390, height: 844 });
  await showView(page, "日程");
  await page.getByRole("button", { name: "对这 4 件事" }).click();
  const menu = page.getByRole("menu");
  const box = (await menu.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, "03-mobile");

  expect(errors).toEqual([]);
});
