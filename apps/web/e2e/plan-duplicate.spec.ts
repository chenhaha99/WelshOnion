import { expect, test } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("复制计划：有块有开销的计划 → 日程里复制到明年 → 进新计划 → 键盘取消 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("关西 10 天");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("3");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");

  // 源计划：10.1「西湖」完成了、挂 300 元
  const days = page.getByRole("list", { name: "日期列表" }).getByRole("listitem");
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const lake = table.locator("tr[data-block-id]").first();
  await table.getByRole("textbox", { name: "加一件事" }).fill("西湖");
  await page.keyboard.press("Enter");
  await lake.getByRole("button", { name: /^标记：/ }).click();
  await expect(lake).toHaveAttribute("data-mark", "done");
  await lake.getByRole("button", { name: "开销" }).click();
  await page.keyboard.type("300");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(lake.locator("[data-money-cell]")).toHaveText("¥300");

  // 回列表，在卡片上复制到 2027-04-29
  await page.getByRole("link", { name: /我的计划/ }).click();
  const sourceCard = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: "关西 10 天", exact: true }) });
  await sourceCard.getByRole("button", { name: "复制" }).click();
  await expect(sourceCard.getByLabel("名字")).toHaveValue("关西 10 天 副本");
  await expect(sourceCard.getByLabel("名字")).toBeFocused();
  await sourceCard.getByLabel("新的出发日期").fill("2027-04-29");
  await shot(page, "01-duplicate-form");
  await sourceCard.getByRole("button", { name: "复制" }).click();

  // 进了新计划：日期平移，完成的恢复成没完成，开销还在
  await expect(page.getByRole("button", { name: "关西 10 天 副本" })).toBeVisible();
  // 复制出来的计划没看过，打开是时间线
  await showView(page, "日程");
  await expect(days).toHaveCount(3);
  await expect(days.nth(0).locator("[data-day-label]")).toContainText("4.29");
  await expect(days.nth(2).locator("[data-day-label]")).toContainText("5.1");
  const copiedLake = page.getByRole("table", { name: /4\.29/ }).locator("tr[data-block-id]").first();
  await expect(copiedLake.getByRole("textbox", { name: "标题" })).toHaveValue("西湖");
  await expect(copiedLake).toHaveAttribute("data-mark", "decided");
  await expect(copiedLake.locator("[data-money-cell]")).toHaveText("¥300");
  await shot(page, "02-copied-plan");

  // 回列表两张卡；在原计划卡上只用键盘打开复制再 Esc：焦点回到「复制」
  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(2);
  const copyButton = sourceCard.getByRole("button", { name: "复制" });
  await copyButton.focus();
  await page.keyboard.press("Enter");
  await expect(sourceCard.getByLabel("名字")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sourceCard.getByLabel("名字")).toHaveCount(0);
  await expect(copyButton).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  // 手机上卡片摘要一行放不下：只在「 · 」处换行，「1 人」这样的一项不拆开
  const summaryParts = page.getByRole("listitem").first().locator("p span");
  await expect(summaryParts).toHaveCount(3);
  expect(await summaryParts.evaluateAll((spans) => spans.every((span) => span.getClientRects().length === 1))).toBe(true);
  await shot(page, "03-mobile-list");
  await copyButton.click();
  await shot(page, "04-mobile-form");

  expect(errors).toEqual([]);
});
