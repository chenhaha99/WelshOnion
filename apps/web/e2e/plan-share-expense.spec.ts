import { expect, test } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("两晚共用一笔房费：第二晚挂上第一晚那笔 → 共用 → 删掉第一晚房费还在 → 撤销 → 手机上拿掉再挂上", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("莫干山两晚");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间轴：这份走查从安排表开始，先切到列表
  await showView(page, "列表");

  const firstDay = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const secondDay = page.getByRole("table", { name: /10\.2 周五 的安排/ });
  for (const table of [firstDay, secondDay]) {
    await table.getByRole("textbox", { name: "加一件事" }).fill("民宿");
    await page.keyboard.press("Enter");
    await table.locator("tr[data-block-id]").first().getByRole("button", { name: /^类型：/ }).click();
    await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "住宿", exact: true }).click();
  }
  const firstNight = firstDay.locator("tr[data-block-id]").first();
  const secondNight = secondDay.locator("tr[data-block-id]").first();
  const summary = page.getByRole("region", { name: "钱的总览" }).locator("[data-money-summary]");

  // 第一晚填 800 的房费
  await firstNight.getByRole("button", { name: "钱" }).click();
  const money = page.getByRole("group", { name: "民宿 的钱" });
  await money.getByRole("textbox", { name: "新一笔的金额" }).fill("800");
  await money.getByRole("textbox", { name: "新一笔的说明" }).fill("民宿两晚");
  await page.keyboard.press("Enter");
  await expect(firstNight.locator("[data-money-cell]")).toHaveText("¥800");
  await page.keyboard.press("Escape");
  await expect(money).toBeHidden();
  await expect(summary).toContainText("另有 1 件事还没填钱");

  // 第二晚挂上第一晚那笔
  await secondNight.getByRole("button", { name: "钱" }).click();
  await money.getByRole("combobox", { name: "挂上已有的一笔" }).selectOption({ label: "住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿" });
  await expect(secondNight.locator("[data-money-cell]")).toHaveText("共用");
  await expect(firstNight.locator("[data-money-cell]")).toHaveText("¥800");
  await expect(money.getByText("也挂在别的事上")).toBeVisible();
  await expect(summary).not.toContainText("还没填钱");
  await shot(page, "01-shared");
  await page.keyboard.press("Escape");
  await expect(money).toBeHidden();

  // 删掉第一晚：房费还挂在第二晚上
  await firstNight.getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();
  await expect(firstDay.locator("tr[data-block-id]")).toHaveCount(0);
  await expect(secondNight.locator("[data-money-cell]")).toHaveText("¥800");
  await expect(summary).toContainText("总额 ¥800");

  // 撤销删除：回到共用
  await page.keyboard.press("Control+z");
  await expect(firstNight.locator("[data-money-cell]")).toHaveText("¥800");
  await expect(secondNight.locator("[data-money-cell]")).toHaveText("共用");

  // 手机宽度：从第二晚拿掉，再用下拉挂上；下拉整个在屏幕里
  await page.setViewportSize({ width: 390, height: 844 });
  await secondNight.getByRole("button", { name: "钱" }).click();
  await money.getByRole("button", { name: "从这件事拿掉" }).click();
  await expect(secondNight.locator("[data-money-cell]")).toHaveText("填钱");
  const pick = money.getByRole("combobox", { name: "挂上已有的一笔" });
  await pick.scrollIntoViewIfNeeded();
  const box = await pick.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await pick.selectOption({ label: "住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿" });
  await expect(secondNight.locator("[data-money-cell]")).toHaveText("共用");
  await shot(page, "02-phone");

  expect(errors).toEqual([]);
});
