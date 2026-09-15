import { expect, test, type Locator } from "@playwright/test";
import { newPlan, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 元素整个在 width × height 的屏幕里。 */
async function expectOnScreen(locator: Locator, name: string, width: number, height: number): Promise<void> {
  const box = (await locator.boundingBox())!;
  expect(box.x, `${name} 的左边`).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, `${name} 的右边`).toBeLessThanOrEqual(width);
  expect(box.y, `${name} 的上边`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${name} 的下边`).toBeLessThanOrEqual(height);
}

const EMPTY_PLAN = "还没有事。加了事、排上时间，就会画在这里";
const NOT_TIMED = "排上时间的事会画在这里：把右边没排时间的事拖到时间轴上，或者在列表里点时间格";

test("电脑上新计划的第一屏：是列表、看得见第 1 天的「加一件事」、没有「只看」→ 点「时间轴」看得见「加第一件事」、「24」不挨着「没排时间」→ 点了切到列表、焦点到第 1 天 → 加一件换回原来那句 → 页顶「计划设置」", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page, 3, { width: 1280, height: 800 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const views = page.getByRole("group", { name: "视图" });
  const add = page.getByRole("table", { name: /10\.1 周四 的安排/ }).getByRole("textbox", { name: "加一件事" });

  // 打开是列表，第 1 天的「加一件事」在第一屏
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expectOnScreen(add, "10.1 的「加一件事」", 1280, 800);
  await expect(page.getByRole("group", { name: "按状态筛选" })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("01-desktop-first-screen.png") });

  // 点「时间轴」：看得见「加第一件事」
  await views.getByRole("button", { name: "时间轴" }).click();
  const timeline = page.getByRole("region", { name: "时间轴" });
  const addFirst = timeline.getByRole("button", { name: "加第一件事" });
  await expect(timeline.getByText(EMPTY_PLAN, { exact: true })).toBeVisible();
  await expectOnScreen(addFirst, "加第一件事", 1280, 800);

  // 表头的「24」写在 24 点那条线左边，和右边一栏的「没排时间」隔开
  const tick = (await timeline.locator("[data-hour-tick]").filter({ hasText: /^24$/ }).boundingBox())!;
  const axis = (await timeline.locator("[data-timeline-axis]").first().boundingBox())!;
  const trayTitle = (await timeline.getByText("没排时间", { exact: true }).boundingBox())!;
  expect(tick.x + tick.width).toBeLessThanOrEqual(axis.x + axis.width + 0.5);
  expect(trayTitle.x - (tick.x + tick.width)).toBeGreaterThanOrEqual(10);

  // 点「加第一件事」：切到列表，焦点在第 1 天的「加一件事」
  await addFirst.click();
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expect(add).toBeFocused();
  await expectOnScreen(add, "10.1 的「加一件事」", 1280, 800);
  await page.keyboard.type("西湖");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "按状态筛选" })).toBeVisible();
  await showView(page, "时间轴");
  await expect(timeline.getByText(NOT_TIMED, { exact: true })).toBeVisible();
  await expect(addFirst).toHaveCount(0);

  const settingsButton = page.getByRole("button", { name: "计划设置", exact: true });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  await expect(settings).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(settings).toHaveCount(0);
  await expect(settingsButton).toBeFocused();
  await shot(page, "02-desktop-after-first");

  expect(errors).toEqual([]);
});

test("手机上新计划的第一屏：是列表，第 1 天的「加一件事」「计划设置」都在第一屏 → 点「时间轴」看得见「加第一件事」→ 点了切到列表、第 1 天的「加一件事」拿到焦点、在屏幕里", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page, 3, { width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  const views = page.getByRole("group", { name: "视图" });
  const add = page.getByRole("table", { name: /10\.1 周四 的安排/ }).getByRole("textbox", { name: "加一件事" });

  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expectOnScreen(add, "10.1 的「加一件事」", 390, 844);
  await expectOnScreen(page.getByRole("button", { name: "计划设置", exact: true }), "计划设置", 390, 844);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath("03-phone-first-screen.png") });

  await views.getByRole("button", { name: "时间轴" }).click();
  const addFirst = page.getByRole("region", { name: "时间轴" }).getByRole("button", { name: "加第一件事" });
  await expectOnScreen(addFirst, "加第一件事", 390, 844);

  await addFirst.click();
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expect(add).toBeFocused();
  await expectOnScreen(add, "10.1 的「加一件事」", 390, 844);
  await page.screenshot({ path: test.info().outputPath("04-phone-after-click.png") });

  expect(errors).toEqual([]);
});
