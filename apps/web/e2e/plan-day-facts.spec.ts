import { expect, test, type Locator, type Page } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

async function schedule(page: Page, row: Locator, title: string, start: string, hours: string): Promise<void> {
  await expect(row.getByRole("textbox", { name: "标题" })).toHaveValue(title);
  await row.getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: `${title} 的时间` });
  await editor.getByLabel("开始").fill(start);
  await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
  await editor.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await editor.getByRole("button", { name: "排上时间" }).click();
  await expect(editor).toBeHidden();
}

test("这天怎么样：空的一天 → 排时间 → 取消时间留下没排的 → 填开销 → 另一天 → 手机", async ({ page }) => {
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

  const days = page.getByRole("list", { name: "每天" }).getByRole("listitem");
  const day1 = days.nth(0);
  const facts = day1.locator("[data-day-facts]");
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");

  // 加三件事，都没排时间：没有这一行
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["西湖", "晚饭", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  await expect(facts).toHaveCount(0);

  // 排上时间：这一行出现，跟着变
  await schedule(page, rows.nth(0), "西湖", "09:00", "3");
  await expect(facts).toHaveText("09:00 起 · 12:00 收工");
  await schedule(page, rows.nth(1), "晚饭", "18:00", "1");
  await expect(facts).toHaveText("09:00 起 · 19:00 收工");
  await shot(page, "01-times");

  // 灵隐寺排上 14:00 起 2 小时再取消时间：时长留着，算进「还有多少没排」
  await schedule(page, rows.nth(2), "灵隐寺", "14:00", "2");
  await expect(rows.nth(1).getByRole("textbox", { name: "标题" })).toHaveValue("灵隐寺");
  await rows.nth(1).getByRole("button", { name: "时间" }).click();
  await page.getByRole("group", { name: "灵隐寺 的时间" }).getByRole("button", { name: "取消时间" }).click();
  await expect(facts).toHaveText("09:00 起 · 19:00 收工 · 还有 2 小时没排");

  // 西湖填 300；晚饭加一笔只写了说明的
  await expect(rows.nth(0).getByRole("textbox", { name: "标题" })).toHaveValue("西湖");
  await rows.nth(0).getByRole("button", { name: "开销" }).click();
  const lakeMoney = page.getByRole("group", { name: "西湖 的开销" });
  await expect(lakeMoney.getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();
  await page.keyboard.type("300");
  await page.keyboard.press("Enter");
  await expect(facts).toHaveText("09:00 起 · 19:00 收工 · 还有 2 小时没排 · 花 ¥300");
  await page.keyboard.press("Escape");
  await expect(lakeMoney).toBeHidden();

  await expect(rows.nth(1).getByRole("textbox", { name: "标题" })).toHaveValue("晚饭");
  await rows.nth(1).getByRole("button", { name: "开销" }).click();
  const dinnerMoney = page.getByRole("group", { name: "晚饭 的开销" });
  await dinnerMoney.getByRole("textbox", { name: "新一笔的说明" }).fill("餐费");
  await page.keyboard.press("Enter");
  await expect(dinnerMoney.locator("[data-expense-id]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dinnerMoney).toBeHidden();
  await expect(facts).toHaveText("09:00 起 · 19:00 收工 · 还有 2 小时没排 · 花 ¥300（还有 1 笔没填）");
  await shot(page, "02-full");

  // 另一天什么都没有：没有这一行
  await expect(days.nth(1).locator("[data-day-facts]")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await day1.scrollIntoViewIfNeeded();
  const box = await day1.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);

  // 手机上一行放不下：只在项和项之间换行，一项不拆开
  expect(await facts.evaluate((line) => line.getBoundingClientRect().height)).toBeGreaterThan(30);
  const parts = facts.locator("span");
  await expect(parts).toHaveCount(4);
  expect(await parts.evaluateAll((spans) => spans.every((span) => span.getClientRects().length === 1))).toBe(true);
  await day1.screenshot({ path: test.info().outputPath("03-mobile-day.png") });
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});
