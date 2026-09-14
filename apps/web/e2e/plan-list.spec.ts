import { expect, test, type Page } from "@playwright/test";

/** 页面报错、React 在控制台喊的警告，都算走查不通过。 */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

function cardTitles(page: Page) {
  return page.getByRole("heading", { level: 2 });
}

function card(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name }) });
}

async function createPlan(page: Page, button: string, name: string): Promise<void> {
  await page.getByRole("button", { name: button }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test("第一次打开 → 新建 → 回列表 → 打开 → 删除", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await expect(page.getByRole("button", { name: "新建第一个计划" })).toBeVisible();
  await shot(page, "01-empty");

  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await expect(page.getByRole("textbox", { name: "计划名" })).toBeFocused();
  await shot(page, "02-new-form");
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆中秋 · 华东自驾");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { level: 1, name: "国庆中秋 · 华东自驾" })).toBeVisible();
  await shot(page, "03-plan-page");

  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(cardTitles(page)).toHaveText(["国庆中秋 · 华东自驾"]);
  await shot(page, "04-list-one");

  await createPlan(page, "新建计划", "关西 10 天");
  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(cardTitles(page)).toHaveText(["关西 10 天", "国庆中秋 · 华东自驾"]);
  await shot(page, "05-list-two");

  // 打开旧的那个，用浏览器的后退回来，它排到最前
  await card(page, "国庆中秋 · 华东自驾").getByRole("link").click();
  await expect(page.getByRole("heading", { level: 1, name: "国庆中秋 · 华东自驾" })).toBeVisible();
  await page.goBack();
  await expect(cardTitles(page)).toHaveText(["国庆中秋 · 华东自驾", "关西 10 天"]);
  await shot(page, "06-reordered");

  // 删除：确认时焦点在「取消」；Esc 取消后焦点回到「删除」
  await card(page, "关西 10 天").getByRole("button", { name: "删除" }).click();
  await expect(card(page, "关西 10 天").getByRole("button", { name: "取消" })).toBeFocused();
  await shot(page, "07-confirm");
  await page.keyboard.press("Escape");
  await expect(card(page, "关西 10 天").getByRole("button", { name: "删除" })).toBeFocused();
  await card(page, "关西 10 天").getByRole("button", { name: "删除" }).click();
  await card(page, "关西 10 天").getByRole("button", { name: "确认删除" }).click();
  await expect(cardTitles(page)).toHaveText(["国庆中秋 · 华东自驾"]);
  await shot(page, "08-after-delete");

  await page.reload();
  await expect(cardTitles(page)).toHaveText(["国庆中秋 · 华东自驾"]);

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "09-mobile-list");

  expect(errors).toEqual([]);
});

test("两个标签页：一边新建另一边就出现；开着的计划被删掉", async ({ context }) => {
  const tabA = await context.newPage();
  const tabB = await context.newPage();
  const errorsA = watchErrors(tabA);
  const errorsB = watchErrors(tabB);

  await tabA.goto("/");
  await tabB.goto("/");
  await expect(tabA.getByRole("button", { name: "新建第一个计划" })).toBeVisible();
  await expect(tabB.getByRole("button", { name: "新建第一个计划" })).toBeVisible();

  await createPlan(tabB, "新建第一个计划", "杭州");
  await expect(cardTitles(tabA)).toHaveText(["杭州"]);
  await shot(tabA, "10-tab-a-sees-new-plan");

  await card(tabA, "杭州").getByRole("link").click();
  await expect(tabA.getByRole("heading", { level: 1, name: "杭州" })).toBeVisible();

  await tabB.getByRole("link", { name: /我的计划/ }).click();
  await card(tabB, "杭州").getByRole("button", { name: "删除" }).click();
  await card(tabB, "杭州").getByRole("button", { name: "确认删除" }).click();
  await expect(tabB.getByRole("button", { name: "新建第一个计划" })).toBeVisible();
  await expect(tabA.getByRole("heading", { name: "这个计划已经删除了" })).toBeVisible();
  await shot(tabA, "11-deleted-elsewhere");

  expect(errorsA).toEqual([]);
  expect(errorsB).toEqual([]);
});
