import { expect, test, type Locator } from "@playwright/test";
import { DAY1, DAY3, addBlocks, countRows, newPlan, pickKind, rowOf } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 元素整个在 width × height 的屏幕里。 */
async function expectOnScreen(locator: Locator, name: string, width: number, height: number): Promise<void> {
  const box = (await locator.boundingBox())!;
  expect(box.x, `${name} 的左边`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} 的右边`).toBeLessThanOrEqual(width);
  expect(box.y, `${name} 的上边`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${name} 的下边`).toBeLessThanOrEqual(height);
}

test("手机上删完：滚到最后一天删一件事 → 提示和「撤销」整个在屏幕里 → 点「撤销」回来、提示不见", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3, { width: 390, height: 844 });
  const lastDay = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, lastDay, ["河坊街", "回家"]);
  // 滚到页面最下面：提示贴在屏幕底部，要在滚过的页面上看它整个露出来
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  await (await rowOf(lastDay, "河坊街")).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "删除" }).click();

  const region = page.getByRole("status", { name: "删完的提示" });
  const notice = region.locator("[data-deleted-notice]");
  await expect(notice).toContainText("删掉了「河坊街」");
  const undo = notice.getByRole("button", { name: "撤销" });
  await expectOnScreen(notice, "提示", 390, 844);
  await expectOnScreen(undo, "撤销", 390, 844);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  // 提示固定在屏幕底部：只截当前屏幕
  await page.screenshot({ path: test.info().outputPath("01-phone-deleted.png") });

  await undo.click();
  await expect.poll(() => countRows(lastDay, "河坊街")).toBe(1);
  await expect(notice).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("02-phone-undone.png") });

  expect(errors).toEqual([]);
});

test("电脑上：开销的编辑区点「收起」收起、焦点回到开销格 → 只看住宿时加一件，表里看得见", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖", "民宿"]);
  await pickKind(page, table, "民宿", "住宿");

  const lake = await rowOf(table, "西湖");
  await lake.getByRole("button", { name: "开销" }).click();
  const editor = page.getByRole("group", { name: "西湖 的开销" });
  const close = editor.getByRole("button", { name: "收起" });
  await expect(close).toBeVisible();
  await shot(page, "03-money-editor");
  await close.click();
  await expect(editor).toBeHidden();
  await expect(lake.getByRole("button", { name: "开销" })).toBeFocused();

  await page.getByRole("group", { name: "按类型筛选" }).getByRole("button", { name: "住宿" }).click();
  await expect.poll(() => countRows(table, "西湖")).toBe(0);
  await addBlocks(page, table, ["酒店"]);
  await expect.poll(() => countRows(table, "酒店")).toBe(1);
  await expect((await rowOf(table, "酒店")).getByRole("button", { name: "类型：住宿" })).toBeVisible();
  await shot(page, "04-add-while-filtered");

  expect(errors).toEqual([]);
});
