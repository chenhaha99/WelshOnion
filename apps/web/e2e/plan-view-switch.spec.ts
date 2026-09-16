import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, DAY1, DAY2, DAY3, newPlanKeepingView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 3 天、每天 4 件事：手机上列表有好几屏长。 */
async function busyPlan(page: Page, width: number, height: number): Promise<void> {
  // 不切视图：这份走查要验「打开就是时间轴」
  await newPlanKeepingView(page, 3, { width, height });
  await addBlocks(page, page.getByRole("table", { name: DAY1 }), ["西湖", "灵隐寺", "河坊街", "宋城"]);
  await addBlocks(page, page.getByRole("table", { name: DAY2 }), ["乌镇", "西栅", "东栅", "夜游"]);
  await addBlocks(page, page.getByRole("table", { name: DAY3 }), ["千岛湖", "游船", "午饭", "回杭州"]);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function edges(locator: Locator): Promise<{ top: number; bottom: number }> {
  const found = (await locator.boundingBox())!;
  return { top: found.y, bottom: found.y + found.height };
}

/** 切换按钮贴在屏幕顶上（离上边不到 12 像素），下面紧挨着 below（隔开不到 24 像素）。 */
async function expectPinned(page: Page, below: Locator): Promise<void> {
  const views = await edges(page.getByRole("group", { name: "视图" }));
  expect(views.top, "切换按钮的上边").toBeGreaterThanOrEqual(0);
  expect(views.top, "切换按钮的上边").toBeLessThan(12);
  const next = (await edges(below)).top - views.bottom;
  expect(next, "下面的视图离切换按钮").toBeGreaterThanOrEqual(0);
  expect(next, "下面的视图离切换按钮").toBeLessThanOrEqual(24);
}

test("手机上切换视图：打开是时间轴 → 列表滚到下面时切换按钮贴顶 → 点「列表」回到开头 → 重新打开还是上次看的", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  const views = page.getByRole("group", { name: "视图" });

  // 打开就是时间轴；点按下的「时间轴」：切换按钮贴顶，时间轴紧挨着它
  await expect(views.getByRole("button", { name: "时间轴", pressed: true })).toBeVisible();
  await views.getByRole("button", { name: "时间轴" }).click();
  await expect(views.getByRole("button", { name: "时间轴", pressed: true })).toBeVisible();
  await expectPinned(page, page.getByRole("region", { name: "时间轴" }));
  await shot(page, "01-phone-timeline");

  // 切到列表往下滚到 10.3：切换按钮贴在顶上
  await views.getByRole("button", { name: "列表" }).click();
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  const stuck = await edges(views);
  expect(stuck.top).toBeGreaterThanOrEqual(0);
  expect(stuck.top).toBeLessThan(12);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);
  await shot(page, "02-phone-list-stuck");

  // 点按下的「列表」：回到列表开头
  await views.getByRole("button", { name: "列表" }).click();
  await expectPinned(page, page.getByRole("group", { name: "分组" }));

  // 切到列表、重新打开：还是列表（默认是时间轴，所以这一下才看得出记住了）
  await page.reload();
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "日期列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "时间轴" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("电脑上时间轴比一屏短：点「时间轴」照样滚到切换按钮贴顶", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 1280, 800);
  const views = page.getByRole("group", { name: "视图" });

  await views.getByRole("button", { name: "时间轴" }).click();
  await expectPinned(page, page.getByRole("region", { name: "时间轴" }));
  await shot(page, "03-desktop-timeline");

  expect(errors).toEqual([]);
});
