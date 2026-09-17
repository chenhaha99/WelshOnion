import { expect, test, type Page } from "@playwright/test";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 2026-09-14（北京时间周一）：日历打开是 2026 年 9 月
const TODAY = new Date("2026-09-14T06:20:00Z");

/** 在计划列表上新建一个计划、定好出发日期和天数，再回到列表。 */
async function createPlan(page: Page, name: string, startDate: string, dayCount: number): Promise<void> {
  // 列表空着是「新建第一个计划」，有计划是「新建计划」；等页面打开完再点
  const create = page.getByRole("button", { name: /^新建(第一个)?计划$/ });
  await expect(create).toBeVisible();
  await create.click();
  await page.getByRole("textbox", { name: "计划名" }).fill(name);
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill(startDate);
  await page.getByLabel("天数").fill(String(dayCount));
  await page.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("group", { name: "视图" })).toBeVisible();
  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(page.getByRole("heading", { name: "我的计划", level: 1 })).toBeVisible();
}

test("电脑上：两个挨着的计划、一个没排日期的 → 日历里跨周折段、重叠分道、没排的列在下面 → 翻月 → 点横条打开", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await createPlan(page, "秋游", "2026-09-18", 5);
  await createPlan(page, "周末露营", "2026-09-19", 2);
  // 一个不排日期的：建好不填出发日期，直接回列表
  await page.getByRole("button", { name: "新建计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("以后再说");
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("出发日期")).toBeVisible();
  await page.getByRole("link", { name: /我的计划/ }).click();

  // 默认是列表；点「日历」
  const views = page.getByRole("group", { name: "计划怎么看" });
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await views.getByRole("button", { name: "日历" }).click();
  const calendar = page.getByRole("region", { name: "日历" });
  await expect(calendar.getByRole("heading", { name: "2026 年 9 月" })).toBeVisible();

  // 「秋游」跨两周折成两段；9.14 那一周里「周末露营」在第 2 道，画在「秋游」下面
  const autumn = calendar.getByRole("link", { name: "秋游 · 9.18 – 9.22 · 5 天 · 1 人" });
  await expect(autumn).toHaveCount(2);
  const camping = calendar.getByRole("link", { name: /^周末露营 · / });
  await expect(camping).toHaveAttribute("data-lane", "2");
  const autumnBox = (await autumn.first().boundingBox())!;
  const campingBox = (await camping.boundingBox())!;
  expect(campingBox.y).toBeGreaterThan(autumnBox.y);
  // 「周末露营」从周六开始：比从周五开始的「秋游」靠右
  expect(campingBox.x).toBeGreaterThan(autumnBox.x);
  // 没排日期的列在下面，画不上也不会不见
  await expect(calendar.getByRole("link", { name: "以后再说" })).toBeVisible();
  await shot(page, "01-calendar");

  // 翻到 10 月再回来；「本月」出现了，标题和两个箭头都不挪
  const header = async () => ({
    title: (await calendar.getByRole("heading").boundingBox())!,
    next: (await calendar.getByRole("button", { name: "下个月" }).boundingBox())!,
  });
  const before = await header();
  await calendar.getByRole("button", { name: "下个月" }).click();
  await expect(calendar.getByRole("heading", { name: "2026 年 10 月" })).toBeVisible();
  const after = await header();
  expect(Math.abs(after.title.x + after.title.width / 2 - (before.title.x + before.title.width / 2))).toBeLessThan(1);
  expect(after.next.x).toBe(before.next.x);
  await shot(page, "02-next-month");
  await calendar.getByRole("button", { name: "本月" }).click();
  await expect(calendar.getByRole("heading", { name: "2026 年 9 月" })).toBeVisible();

  // 刷新还是日历；点「周末露营」打开它
  await page.reload();
  await expect(page.getByRole("region", { name: "日历" })).toBeVisible();
  await page.getByRole("region", { name: "日历" }).getByRole("link", { name: /^周末露营 · / }).click();
  await expect(page.getByRole("heading", { name: "周末露营", level: 1 })).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：月历一屏放得下，不横着滚", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(TODAY);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await createPlan(page, "秋游", "2026-09-18", 5);

  await page.getByRole("group", { name: "计划怎么看" }).getByRole("button", { name: "日历" }).click();
  const calendar = page.getByRole("region", { name: "日历" });
  await expect(calendar.getByRole("heading", { name: "2026 年 9 月" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const box = (await calendar.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  await shot(page, "03-phone-calendar");

  expect(errors).toEqual([]);
});
