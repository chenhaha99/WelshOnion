import { expect, test, type Locator } from "@playwright/test";
import { DAY1, addBlocks, newPlan, rowOf, schedule } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 元素左右两边都在宽 width 的屏幕里。 */
async function expectInsideWidth(locator: Locator, name: string, width: number): Promise<void> {
  const box = (await locator.boundingBox())!;
  expect(box.x, `${name} 的左边`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} 的右边`).toBeLessThanOrEqual(width);
}

/** 安排表外面那个框还能横着滚多少像素。 */
async function horizontalOverflow(table: Locator): Promise<number> {
  return table.evaluate((element) => element.parentElement!.scrollWidth - element.parentElement!.clientWidth);
}

function controlsOf(row: Locator): Array<[string, Locator]> {
  return [
    ["标题", row.getByRole("textbox", { name: "标题" })],
    ["类型", row.getByRole("button", { name: /^类型：/ })],
    ["状态", row.getByRole("button", { name: /^状态：/ })],
    ["时间", row.getByRole("button", { name: "时间" })],
    ["钱", row.getByRole("button", { name: "钱" })],
    ["这件事的操作", row.getByRole("button", { name: "这件事的操作" })],
  ];
}

test("手机上一个块一张卡：六个控件都在屏幕里、操作在标题那一行 → 缩进整张卡往右 → 钱的编辑区在屏幕里 → 电脑上还是一行", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖", "河坊街", "灵隐寺"]);
  await schedule(page, table, "西湖", "09:00", "3");
  const money = page.getByRole("group", { name: "西湖 的钱" });
  await (await rowOf(table, "西湖")).getByRole("button", { name: "钱" }).click();
  await money.getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect((await rowOf(table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await (await rowOf(table, "西湖")).getByRole("button", { name: "钱" }).click();
  await expect(money).toBeHidden();
  await (await rowOf(table, "灵隐寺")).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "缩进" }).click();
  await expect((await rowOf(table, "灵隐寺")).locator("td").first()).toHaveAttribute("data-indent", "1");

  // 390 像素：「西湖」的六个控件左右都在屏幕里，时间在标题下面；安排表和页面都不横着滚
  const lake = await rowOf(table, "西湖");
  for (const [name, control] of controlsOf(lake)) await expectInsideWidth(control, name, 390);
  const title = (await lake.getByRole("textbox", { name: "标题" }).boundingBox())!;
  const time = (await lake.getByRole("button", { name: "时间" }).boundingBox())!;
  expect(time.y).toBeGreaterThanOrEqual(title.y + title.height);
  expect(await horizontalOverflow(table)).toBeLessThanOrEqual(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  // 每张卡的「这件事的操作」都在标题那一行的右边，不会一个人占一行
  for (const name of ["西湖", "河坊街", "灵隐寺"]) {
    const row = await rowOf(table, name);
    const rowTitle = (await row.getByRole("textbox", { name: "标题" }).boundingBox())!;
    const menu = (await row.getByRole("button", { name: "这件事的操作" }).boundingBox())!;
    expect(menu.y, `${name} 的「这件事的操作」和标题同一行`).toBeLessThan(rowTitle.y + rowTitle.height);
  }

  // 缩进的「灵隐寺」整张卡往右 16 像素
  const street = (await (await rowOf(table, "河坊街")).boundingBox())!;
  const temple = (await (await rowOf(table, "灵隐寺")).boundingBox())!;
  expect(Math.round(temple.x - street.x)).toBe(16);
  await table.scrollIntoViewIfNeeded();
  await shot(page, "01-phone-cards");

  // 展开钱：编辑区在卡片下面，左右都在屏幕里
  await lake.getByRole("button", { name: "钱" }).click();
  await expect(money).toBeVisible();
  await expectInsideWidth(money, "西湖 的钱", 390);
  await shot(page, "02-phone-money");
  await lake.getByRole("button", { name: "钱" }).click();
  await expect(money).toBeHidden();

  // 电脑上：还是一行，时间和标题在同一行；安排表不横着滚
  await page.setViewportSize({ width: 1280, height: 900 });
  const wideTitle = (await lake.getByRole("textbox", { name: "标题" }).boundingBox())!;
  const wideTime = (await lake.getByRole("button", { name: "时间" }).boundingBox())!;
  expect(wideTime.y).toBeLessThan(wideTitle.y + wideTitle.height);
  expect(await horizontalOverflow(table)).toBeLessThanOrEqual(0);
  await shot(page, "03-desktop-table");

  expect(errors).toEqual([]);
});
