import { expect, test, type Locator, type Page } from "@playwright/test";
import { DAY1, DAY2, addBlocks, addMoney, keepUndated, newPlan, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 两天有事、第 3 天空着：10.1 西湖 ¥300 和午饭叠了半小时、灵隐寺没排时间 2 小时；10.2 乌镇 ¥450。 */
async function trip(page: Page, width: number, height: number): Promise<void> {
  await newPlan(page, 3, { width, height });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖", "午饭", "灵隐寺"]);
  await schedule(page, day1, "西湖", "09:00", "3");
  await schedule(page, day1, "午饭", "11:30", "1");
  await keepUndated(page, day1, "灵隐寺", undefined, "2");
  await addMoney(page, day1, "西湖", "300");
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day2, ["乌镇"]);
  await schedule(page, day2, "乌镇", "09:00", "8");
  await addMoney(page, day2, "乌镇", "450");
}

/** 表里行头是 name（日期或「合计」）的那一行。 */
function tableRow(table: Locator, name: RegExp | string): Locator {
  return table.getByRole("row").filter({ has: table.page().getByRole("rowheader", { name }) });
}

/** 这一行各格的字。 */
async function rowTexts(table: Locator, name: RegExp | string): Promise<string[]> {
  return tableRow(table, name).getByRole("cell").allInnerTexts();
}

/** 细条填了几成：填的宽 ÷ 整道的宽。 */
async function barShare(table: Locator, name: RegExp): Promise<number> {
  return tableRow(table, name)
    .locator("[data-money-bar]")
    .evaluate((track) => track.firstElementChild!.getBoundingClientRect().width / track.getBoundingClientRect().width);
}

test("电脑上：总览里并排看每天 → 细条按各天花的钱比 → 点日期到时间轴上的那天", async ({ page }) => {
  const errors = watchErrors(page);
  // 「现在」是 10.2 上午：那天写「今天」
  await page.clock.setFixedTime(new Date("2026-10-02T02:00:00Z"));
  await trip(page, 1280, 800);
  await showView(page, "总览");

  const card = page.getByRole("region", { name: "每天" });
  const table = card.getByRole("table", { name: "每天" });
  // 开销总览、每天、占比从上到下
  const tops = await Promise.all(
    [page.getByRole("region", { name: "开销总览" }), card, page.getByRole("region", { name: "占比" })].map(
      async (region) => (await region.boundingBox())!.y,
    ),
  );
  expect(tops).toEqual([...tops].sort((a, b) => a - b));

  // 整趟没有自驾：没有那一列
  expect(await table.getByRole("columnheader").allInnerTexts()).toEqual(["日期", "起–收工", "排了", "还没排", "花", "几件"]);
  expect(await rowTexts(table, /10\.1/)).toEqual(["09:00–12:30", "3.5 小时", "2 小时", "¥300", "3 件"]);
  expect(await rowTexts(table, /10\.2/)).toEqual(["09:00–17:00", "8 小时", "", "¥450", "1 件"]);
  expect(await rowTexts(table, /10\.3/)).toEqual(["", "", "", "", ""]);
  expect(await rowTexts(table, "合计")).toEqual(["", "11.5 小时", "2 小时", "¥750", "4 件"]);
  // 没花钱的那天没有细条
  await expect(tableRow(table, /10\.3/).locator("[data-money-bar]")).toHaveCount(0);
  await expect(table.getByRole("rowheader", { name: /10\.2/ })).toContainText("今天");
  await expect(table.getByRole("rowheader", { name: /10\.1/ })).not.toContainText("今天");
  expect(await barShare(table, /10\.2/)).toBeCloseTo(1, 2);
  expect(await barShare(table, /10\.1/)).toBeCloseTo(300 / 450, 2);
  await shot(page, "01-desktop-days");

  // 点第 3 天的日期：到时间轴，那一行的「这天的操作」在屏幕里、有焦点
  await card.getByRole("button", { name: "在时间轴上看 第 3 天 · 10.3 周六" }).click();
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name: "时间轴", pressed: true })).toBeVisible();
  const menu = page
    .getByRole("region", { name: "时间轴" })
    .getByRole("listitem", { name: /10\.3/ })
    .getByRole("button", { name: "这天的操作" });
  await expect(menu).toBeFocused();
  await expect(menu).toBeInViewport({ ratio: 1 });
  await shot(page, "02-desktop-jumped");

  expect(errors).toEqual([]);
});

test("手机上：一天两行字、不横着滚 → 点日期竖排翻到那天", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 390, 844);
  await showView(page, "总览");

  const card = page.getByRole("region", { name: "每天" });
  await expect(card.getByRole("table")).toHaveCount(0);
  const oct1 = card.getByRole("list", { name: "每天" }).getByRole("listitem").first();
  await expect(oct1.getByRole("button", { name: "在时间轴上看 第 1 天 · 10.1 周四" })).toBeVisible();
  await expect(oct1.locator("[data-day-money]")).toHaveText("¥300");
  await expect(oct1.locator("[data-day-line]")).toHaveText("09:00 起 · 12:30 收工 · 排了 3.5 小时 · 还有 2 小时没排 · 3 件");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("03-phone-days.png") });

  await card.getByRole("button", { name: "在时间轴上看 第 2 天 · 10.2 周五" }).click();
  await expect(page.locator("[data-timeline-day]")).toHaveText("第 2 天 · 10.2 周五");
  await expect(page.locator("[data-base-id]").getByRole("button", { name: "这天的操作" })).toBeFocused();
  await page.screenshot({ path: test.info().outputPath("04-phone-jumped.png") });

  expect(errors).toEqual([]);
});
