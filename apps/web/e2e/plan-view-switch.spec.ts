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

/**
 * 像人一样点：点在按钮现在看得见的地方。
 * 不用 locator.click()：它点之前先把元素「滚进视野」，贴顶的按钮被当成还在原处，页面先被滚回最上面，量的就不是真人点的样子。
 */
async function clickInPlace(page: Page, button: Locator): Promise<void> {
  const box = (await button.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 页面没滚：还在点之前滚到的地方（默认最上面），切换按钮还在点之前的地方。 */
async function expectStill(page: Page, before: { top: number }, scrollY = 0): Promise<void> {
  expect(await page.evaluate(() => window.scrollY), "页面没滚").toBe(scrollY);
  const now = await edges(page.getByRole("group", { name: "视图" }));
  expect(Math.abs(now.top - before.top), "切换按钮没动").toBeLessThan(1);
}

/**
 * 切换按钮贴在屏幕顶上（离上边不到 12 像素），下面紧挨着 below（隔开不到 24 像素）。
 * 量的是整行（`[data-view-row]`）：这一行右边还有「标题」「时长」「开销」和放大条，窄屏上会折到第二行。
 */
async function expectPinned(page: Page, below: Locator): Promise<void> {
  const views = await edges(page.getByRole("group", { name: "视图" }));
  expect(views.top, "切换按钮的上边").toBeGreaterThanOrEqual(0);
  expect(views.top, "切换按钮的上边").toBeLessThan(12);
  const row = await edges(page.locator("[data-view-row]"));
  const next = (await edges(below)).top - row.bottom;
  expect(next, "下面的视图离切换按钮那一行").toBeGreaterThanOrEqual(0);
  expect(next, "下面的视图离切换按钮那一行").toBeLessThanOrEqual(24);
}

test("手机上切换视图：打开是时间轴 → 页面在最上面时点切换不跳 → 列表滚到下面时切换按钮贴顶 → 点「列表」回到开头 → 重新打开还是上次看的", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  const views = page.getByRole("group", { name: "视图" });

  // 打开就是时间轴；页面在最上面时点切换：页面不滚，切换按钮留在原处（你提的：上面只剩两行，维持不动就行）
  await expect(views.getByRole("button", { name: "时间轴", pressed: true })).toBeVisible();
  const before = await edges(views);
  expect(before.top, "切换按钮本来就在第一屏、没贴顶").toBeGreaterThan(40);
  await clickInPlace(page, views.getByRole("button", { name: "时间轴" }));
  await expect(views.getByRole("button", { name: "时间轴", pressed: true })).toBeVisible();
  await expectStill(page, before);
  await shot(page, "01-phone-timeline");
  await clickInPlace(page, views.getByRole("button", { name: "列表" }));
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expectStill(page, before);

  // 列表往下滚到 10.3：切换按钮贴在顶上
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  const stuck = await edges(views);
  expect(stuck.top).toBeGreaterThanOrEqual(0);
  expect(stuck.top).toBeLessThan(12);
  // 真的往下滚了一大截，贴顶才看得出来
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await shot(page, "02-phone-list-stuck");

  // 贴在顶上时点按下的「列表」：按钮不动，列表回到开头
  await clickInPlace(page, views.getByRole("button", { name: "列表" }));
  await expectPinned(page, page.getByRole("group", { name: "分组" }));

  // 贴在顶上时切到时间轴：按钮不动，时间轴从开头露出来（不停在列表滚到的地方）
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await clickInPlace(page, views.getByRole("button", { name: "时间轴" }));
  await expectPinned(page, page.getByRole("region", { name: "时间轴" }));
  await clickInPlace(page, views.getByRole("button", { name: "列表" }));

  // 切到列表、重新打开：还是列表（默认是时间轴，所以这一下才看得出记住了）
  await page.reload();
  await expect(views.getByRole("button", { name: "列表", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "日期列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "时间轴" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("电脑上：页面在最上面时点切换不跳 → 滚下去以后切到比一屏短的时间轴，切换按钮还贴顶、时间轴从开头露出来", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 1280, 800);
  const views = page.getByRole("group", { name: "视图" });

  const before = await edges(views);
  for (const name of ["时间轴", "列表", "总览", "列表"]) {
    await clickInPlace(page, views.getByRole("button", { name }));
    await expect(views.getByRole("button", { name, pressed: true })).toBeVisible();
    await expectStill(page, before);
  }

  // 往下滚了一点、按钮还没贴顶：照样不滚，切到比一屏短的总览也不动
  await page.evaluate(() => window.scrollTo(0, 40));
  const partway = await edges(views);
  await clickInPlace(page, views.getByRole("button", { name: "总览" }));
  await expect(views.getByRole("button", { name: "总览", pressed: true })).toBeVisible();
  await expectStill(page, partway, 40);
  await clickInPlace(page, views.getByRole("button", { name: "列表" }));
  await expectStill(page, partway, 40);

  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  expect((await edges(views)).top, "滚下去以后切换按钮贴在顶上").toBeLessThan(12);
  await clickInPlace(page, views.getByRole("button", { name: "时间轴" }));
  await expectPinned(page, page.getByRole("region", { name: "时间轴" }));
  await shot(page, "03-desktop-timeline");

  expect(errors).toEqual([]);
});
