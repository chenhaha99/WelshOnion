import { expect, test, type Locator } from "@playwright/test";
import { DAY1, addBlocks, newPlan, rowOf, schedule } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 元素左右两边都在宽 width 的屏幕里。 */
async function expectInsideWidth(locator: Locator, name: string, width: number): Promise<void> {
  const box = (await locator.boundingBox())!;
  expect(box.x, `${name} 的左边`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} 的右边`).toBeLessThanOrEqual(width);
}

/** 时刻表外面那个框还能横着滚多少像素。 */
async function horizontalOverflow(table: Locator): Promise<number> {
  return table.evaluate((element) => element.parentElement!.scrollWidth - element.parentElement!.clientWidth);
}

function controlsOf(row: Locator): Array<[string, Locator]> {
  return [
    ["划掉", row.getByRole("button", { name: /^标记：/ })],
    ["标题", row.getByRole("textbox", { name: "标题" })],
    ["类型", row.getByRole("button", { name: /^类型：/ })],
    ["标签", row.getByRole("button", { name: /^标签：/ })],
    ["时间", row.getByRole("button", { name: "时间" })],
    ["开销", row.getByRole("button", { name: "开销" })],
    ["这件事的操作", row.getByRole("button", { name: "这件事的操作" })],
  ];
}

test("手机上的时刻表：七个控件都在屏幕里、时间和操作在卡片第一行、标题在下面 → 缩进整张卡往右 → 开销的编辑区在屏幕里 → 电脑上组头在左边一列", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖", "河坊街", "灵隐寺"]);
  await schedule(page, table, "西湖", "09:00", "3");
  const money = page.getByRole("group", { name: "西湖 的开销" });
  await (await rowOf(table, "西湖")).getByRole("button", { name: "开销" }).click();
  await money.getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect((await rowOf(table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await (await rowOf(table, "西湖")).getByRole("button", { name: "开销" }).click();
  await expect(money).toBeHidden();
  await (await rowOf(table, "灵隐寺")).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "缩进" }).click();
  await expect((await rowOf(table, "灵隐寺")).locator("[data-indent]")).toHaveAttribute("data-indent", "1");

  // 390 像素：「西湖」的七个控件左右都在屏幕里；时刻表和页面都不横着滚
  const lake = await rowOf(table, "西湖");
  for (const [name, control] of controlsOf(lake)) await expectInsideWidth(control, name, 390);
  expect(await horizontalOverflow(table)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // 每张卡：「时间」和「这件事的操作」在第一行，标题在它们下面
  for (const name of ["西湖", "河坊街", "灵隐寺"]) {
    const row = await rowOf(table, name);
    const time = (await row.getByRole("button", { name: "时间" }).boundingBox())!;
    const menu = (await row.getByRole("button", { name: "这件事的操作" }).boundingBox())!;
    const rowTitle = (await row.getByRole("textbox", { name: "标题" }).boundingBox())!;
    expect(menu.y, `${name} 的「这件事的操作」和「时间」同一行`).toBeLessThan(time.y + time.height);
    expect(rowTitle.y, `${name} 的标题在「时间」下面`).toBeGreaterThanOrEqual(time.y + time.height - 1);
  }

  // 缩进的「灵隐寺」整张卡往右 16 像素
  const street = (await (await rowOf(table, "河坊街")).locator(".schedule-card").boundingBox())!;
  const temple = (await (await rowOf(table, "灵隐寺")).locator(".schedule-card").boundingBox())!;
  expect(Math.round(temple.x - street.x)).toBe(16);
  await table.scrollIntoViewIfNeeded();
  await shot(page, "01-phone-schedule");

  // 展开开销：编辑区在卡片下面，左右都在屏幕里
  await lake.getByRole("button", { name: "开销" }).click();
  await expect(money).toBeVisible();
  await expectInsideWidth(money, "西湖 的开销", 390);
  await shot(page, "02-phone-money");
  await lake.getByRole("button", { name: "开销" }).click();
  await expect(money).toBeHidden();

  // 电脑上：「第 1 天」「10.1 周四」「这天的操作」在时刻表左边；时刻表不横着滚
  await page.setViewportSize({ width: 1280, height: 900 });
  const day = page.getByRole("list", { name: "日期列表" }).getByRole("listitem").first();
  const tableBox = (await table.boundingBox())!;
  for (const [name, part] of [
    ["标签", day.locator("[data-day-label]")],
    ["这天的操作", day.getByRole("button", { name: "这天的操作" })],
  ] as const) {
    const box = (await part.boundingBox())!;
    expect(box.x + box.width, `${name} 在时刻表左边`).toBeLessThanOrEqual(tableBox.x);
  }
  expect(await horizontalOverflow(table)).toBeLessThanOrEqual(0);
  await shot(page, "03-desktop-schedule");

  expect(errors).toEqual([]);
});
