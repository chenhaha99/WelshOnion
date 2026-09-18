import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, DAY1, DAY2, DAY3, newPlan, newPlanKeepingView, pickKind, rowOf } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 3 天、每天 4 件事：手机上日程有好几屏长。 */
async function busyPlan(page: Page, width: number, height: number): Promise<void> {
  // 不切视图：这份走查要验「打开就是时间线」
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
 * 不用 locator.click()：它点之前先把元素「滚进视野」，钉在顶上的按钮被当成还在原处，页面先被滚回最上面，量的就不是真人点的样子。
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

/** 顶上那一块（页顶、筛选、切换按钮）钉在屏幕顶上：页顶离上边不到 12 像素。 */
async function expectBlockPinned(page: Page): Promise<void> {
  const top = await edges(page.locator("[data-top-row]"));
  expect(top.top, "页顶的上边").toBeGreaterThanOrEqual(0);
  expect(top.top, "页顶的上边").toBeLessThan(12);
}

/** 顶上那一块钉在顶上，下面紧挨着 below（隔开不到 24 像素）。 */
async function expectPinned(page: Page, below: Locator): Promise<void> {
  await expectBlockPinned(page);
  const block = await edges(page.locator("[data-pinned-top]"));
  const next = (await edges(below)).top - block.bottom;
  expect(next, "下面的视图离顶上那一块").toBeGreaterThanOrEqual(0);
  expect(next, "下面的视图离顶上那一块").toBeLessThanOrEqual(24);
}

/** 顶上那一块钉住了才有底色，没钉住时透明、和页面融在一起。钉上、松开到下一帧才换，所以用会重试的断言。 */
async function expectBackground(page: Page, stuck: boolean): Promise<void> {
  const block = page.locator("[data-pinned-top]");
  if (stuck) await expect(block, "钉住了有底色").not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  else await expect(block, "没钉住时没有底色").toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
}

/** 整个在屏幕里（上下都算）。 */
async function expectOnScreen(page: Page, locator: Locator, name: string): Promise<void> {
  const box = (await locator.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y, `${name} 的上边`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${name} 的下边`).toBeLessThanOrEqual(height);
}

test("手机上切换视图：打开是时间线 → 页面在最上面时点切换不跳 → 日程滚到下面时整块钉在顶上 → 点「日程」回到开头 → 重新打开还是上次看的", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  const views = page.getByRole("group", { name: "视图" });

  // 打开就是时间线；页面在最上面时点切换：页面不滚，切换按钮留在原处（你提的：上面只剩两行，维持不动就行）
  await expect(views.getByRole("button", { name: "时间线", pressed: true })).toBeVisible();
  // 页面在最上面：顶上那一块没钉住，没有底色；页顶还在离上边 32 像素（和还没加天时一样，加了天页顶不往下挪）
  expect(Math.abs((await edges(page.locator("[data-top-row]"))).top - 32), "页顶离上边 32 像素").toBeLessThan(1);
  await expectBackground(page, false);
  const before = await edges(views);
  expect(before.top, "切换按钮本来就在第一屏、没贴顶").toBeGreaterThan(40);
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expect(views.getByRole("button", { name: "时间线", pressed: true })).toBeVisible();
  await expectStill(page, before);
  await shot(page, "01-phone-timeline");
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expect(views.getByRole("button", { name: "日程", pressed: true })).toBeVisible();
  await expectStill(page, before);

  // 划掉一件：筛选那一行出现「只看没划掉的」
  await (await rowOf(page.getByRole("table", { name: DAY1 }), "西湖")).getByRole("checkbox", { name: "划掉" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));

  // 日程往下滚到 10.3：页顶、筛选、切换按钮整块钉在顶上，「撤销」「只看没划掉的」、切换按钮都点得到
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  // 真的往下滚了一大截，钉住才看得出来
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(600);
  await expectBlockPinned(page);
  await expectBackground(page, true);
  await expectOnScreen(page, page.getByRole("button", { name: "撤销" }), "撤销");
  await expectOnScreen(page, page.getByRole("button", { name: "只看没划掉的" }), "只看没划掉的");
  await expectOnScreen(page, views, "切换按钮");
  // 10.3 的时刻表在这一块下面，没被挡住
  const block = await edges(page.locator("[data-pinned-top]"));
  expect((await edges(page.getByRole("table", { name: DAY3 }))).top).toBeGreaterThanOrEqual(block.bottom - 1);
  await shot(page, "02-phone-list-pinned");

  // 贴在顶上时点按下的「日程」：这一块不动，日程回到开头
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expectPinned(page, page.getByRole("list", { name: "日期列表" }));

  // 贴在顶上时切到时间线：这一块不动，时间线从开头露出来（不停在日程滚到的地方）
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expectPinned(page, page.getByRole("region", { name: "时间线" }));
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));

  // 切到日程、重新打开：还是日程（默认是时间线，所以这一下才看得出记住了）
  await page.reload();
  await expect(views.getByRole("button", { name: "日程", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "日期列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "时间线" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("手机上走到的输入框不被顶上那一块挡住", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  const views = page.getByRole("group", { name: "视图" });
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const title = (await rowOf(page.getByRole("table", { name: DAY1 }), "西湖")).getByRole("textbox", { name: "标题" });
  await title.evaluate((element) => (element as HTMLElement).focus());
  await expect(title).toBeFocused();
  const block = await edges(page.locator("[data-pinned-top]"));
  const box = await edges(title);
  expect(box.top, "标题框在这一块下面").toBeGreaterThanOrEqual(block.bottom - 1);
  expect(box.bottom, "标题框在屏幕里").toBeLessThanOrEqual(844);

  expect(errors).toEqual([]);
});

test("手机上筛选不折行：五种类型加「只看没划掉的」只占一行，左右滑得到最后一个", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖", "开车", "午饭", "民宿", "买茶"]);
  await pickKind(page, day1, "开车", "交通");
  await pickKind(page, day1, "午饭", "餐饮");
  await pickKind(page, day1, "民宿", "住宿");
  await pickKind(page, day1, "买茶", "购物");
  await (await rowOf(day1, "西湖")).getByRole("checkbox", { name: "划掉" }).click();

  const row = page.locator("[data-filter-row]");
  const onlyUnchecked = page.getByRole("button", { name: "只看没划掉的" });
  await expect(onlyUnchecked).toBeAttached();
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  // 一行：「只看没划掉的」和第一个类型按钮一样高（没折到下一行）；这一行比屏幕宽，能左右滑
  expect(Math.abs((await edges(onlyUnchecked)).top - (await edges(kinds.getByRole("button").first())).top)).toBeLessThan(2);
  expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await row.evaluate((element) => (element.scrollLeft = element.scrollWidth));
  const box = (await onlyUnchecked.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "03-phone-filter-row");

  expect(errors).toEqual([]);
});

test("电脑上：页面在最上面时点切换不跳 → 滚下去以后整块钉在顶上，切到比一屏短的时间线、时间线从开头露出来", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 1280, 800);
  const views = page.getByRole("group", { name: "视图" });

  const before = await edges(views);
  for (const name of ["时间线", "日程", "总览", "日程"]) {
    await clickInPlace(page, views.getByRole("button", { name }));
    await expect(views.getByRole("button", { name, pressed: true })).toBeVisible();
    await expectStill(page, before);
  }

  // 往下滚了一点、这一块还没粘上：照样不滚，切到比一屏短的总览也不动
  await page.evaluate(() => window.scrollTo(0, 10));
  const partway = await edges(views);
  await clickInPlace(page, views.getByRole("button", { name: "总览" }));
  await expect(views.getByRole("button", { name: "总览", pressed: true })).toBeVisible();
  await expectStill(page, partway, 10);
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expectStill(page, partway, 10);
  await expectBackground(page, false);

  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  await expectBlockPinned(page);
  await expectBackground(page, true);
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expectPinned(page, page.getByRole("region", { name: "时间线" }));
  await shot(page, "04-desktop-timeline");

  expect(errors).toEqual([]);
});
