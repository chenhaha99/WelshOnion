import { expect, test, type Page } from "@playwright/test";
import { addBlocks, addMoney, DAY1, DAY2, DAY3, newPlan, pickKind, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 点开「天」，点几天，按 Esc 关掉面板。 */
async function pickDays(page: Page, ...numbers: number[]): Promise<void> {
  await page.getByRole("button", { name: /^按天筛选：/ }).click();
  const panel = page.getByRole("dialog", { name: "按天筛选" });
  for (const number of numbers) await panel.getByRole("button", { name: new RegExp(`^第 ${number} 天`) }).click();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
}

test("按天筛选：只看第 1–2 天 → 日程、总览、时间线都跟着 → 全部天 → 手机", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3);
  const day1 = page.getByRole("table", { name: DAY1 });
  const day3 = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, day1, ["西湖"]);
  await addBlocks(page, page.getByRole("table", { name: DAY2 }), ["乌镇"]);
  await addBlocks(page, day3, ["灵隐寺"]);
  await pickKind(page, day3, "灵隐寺", "餐饮");
  await schedule(page, day1, "西湖", "09:00", "3");
  await schedule(page, day3, "灵隐寺", "09:00", "1");
  await addMoney(page, day1, "西湖", "300");
  await addMoney(page, day3, "灵隐寺", "100");

  // 没筛时按钮上就写「天」
  const dayButton = page.getByRole("button", { name: /^按天筛选：/ });
  await expect(dayButton).toHaveText("天");
  await dayButton.click();
  await shot(page, "01-day-panel");
  await page.keyboard.press("Escape");

  // 只看第 1–2 天：日程只剩这两天，按钮上写「第 1–2 天」
  await pickDays(page, 1, 2);
  await expect(dayButton).toHaveText("第 1–2 天");
  const days = page.getByRole("list", { name: "每天" }).getByRole("listitem");
  await expect(days).toHaveCount(2);
  await expect(days.locator("[data-day-label]")).toHaveText([/^第 1 天/, /^第 2 天/]);
  await shot(page, "02-first-two-days");

  // 总览：总额、占比只算这两天（灵隐寺的 ¥100、1 小时都不算）
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });
  await expect(card.locator("[data-ring-money]")).toHaveText("¥300");
  await expect(card.getByRole("list", { name: "按类型" }).getByRole("listitem")).toHaveText(["游玩 ¥300 · 100%"]);
  await shot(page, "03-overview");

  // 时间线：三天的行都在（行是时间的格子，位置不变才拖得动），但第 3 天上不画块
  await showView(page, "时间线");
  await expect(page.getByRole("region", { name: "时间线" }).locator("[data-segment]")).toHaveCount(1);
  await showView(page, "日程");

  // 全部天：三天都回来，面板自己收掉（不筛了，正好看结果），焦点回到按钮
  await dayButton.click();
  await page.getByRole("dialog", { name: "按天筛选" }).getByRole("button", { name: "全部天" }).click();
  await expect(page.getByRole("dialog", { name: "按天筛选" })).toHaveCount(0);
  await expect(dayButton).toBeFocused();
  await expect(dayButton).toHaveText("天");
  await expect(days).toHaveCount(3);

  // 手机：按钮在筛选那一排里，面板整个在屏幕里
  await page.setViewportSize({ width: 390, height: 844 });
  await dayButton.click();
  const panel = page.getByRole("dialog", { name: "按天筛选" });
  const box = (await panel.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await panel.getByRole("button", { name: /^第 3 天/ }).click();
  await page.keyboard.press("Escape");
  await expect(dayButton).toHaveText("第 3 天");
  await expect(page.evaluate(() => document.documentElement.scrollWidth)).resolves.toBeLessThanOrEqual(390);
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});
