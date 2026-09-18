import { expect, test } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("安排表：连着加几件事 → 改类型、划掉一件 → 排时间 → 缩进 → 删除再撤销", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");

  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  const add = table.getByRole("textbox", { name: "加一件事" });

  // 只用键盘连着加三件
  await add.click();
  for (const title of ["早茶", "西湖", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  await expect(add).toBeFocused();
  await shot(page, "01-added");

  await rows.nth(0).getByRole("button", { name: /^类型：/ }).click();
  // 选项旁边有「「餐饮」的操作」按钮，按名字找选项要精确匹配
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "餐饮", exact: true }).click();
  await expect(rows.nth(0).getByRole("button", { name: "类型：餐饮" })).toBeVisible();
  await rows.nth(1).getByRole("checkbox", { name: "划掉" }).check();
  await expect(rows.nth(1)).toHaveAttribute("data-checked", "true");

  // 给早茶排上 08:00 起 1 小时
  await rows.nth(0).getByRole("button", { name: "时间" }).click();
  const breakfastTime = page.getByRole("group", { name: "早茶 的时间" });
  await breakfastTime.getByLabel("开始").fill("08:00");
  await breakfastTime.getByRole("spinbutton", { name: "小时" }).fill("1");
  await breakfastTime.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await breakfastTime.getByRole("button", { name: "排上时间" }).click();
  await expect(rows.nth(0).locator("[data-block-time]")).toHaveText("08:00–09:00");

  await rows.nth(2).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "缩进" }).click();
  await expect(rows.nth(2).locator("[data-indent]")).toHaveAttribute("data-indent", "1");
  await shot(page, "02-arranged");

  await rows.nth(1).getByRole("button", { name: "时间" }).click();
  await expect(page.getByRole("group", { name: "西湖 的时间" })).toBeVisible();
  await shot(page, "03-time-editor");
  await page.getByRole("group", { name: "西湖 的时间" }).getByRole("button", { name: "收起" }).click();

  await rows.nth(2).getByRole("button", { name: "这件事的操作" }).click();
  await expect(page.getByRole("menuitem", { name: "取消缩进" })).toBeFocused();
  await shot(page, "04-row-menu");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();

  // 删除西湖，再撤销
  await rows.nth(1).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(rows).toHaveCount(2);
  await page.keyboard.press("Control+z");
  await expect(rows).toHaveCount(3);
  await shot(page, "05-after-undo");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "06-mobile");

  expect(errors).toEqual([]);
});
