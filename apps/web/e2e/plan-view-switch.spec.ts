import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, DAY1, DAY2, DAY3, newPlan, newPlanKeepingView, pickKind, rowOf } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

const TRANSPARENT = "rgba(0, 0, 0, 0)";

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

const topBar = (page: Page) => page.locator("[data-top-bar]");
const viewGroup = (page: Page) => page.getByRole("group", { name: "视图" });

/**
 * 像人一样点：点在按钮现在看得见的地方。
 * 不用 locator.click()：它点之前先把元素「滚进视野」，钉在顶上、弹出来的按钮被当成还在原处，页面先被滚回最上面，量的就不是真人点的样子。
 */
async function clickInPlace(page: Page, button: Locator): Promise<void> {
  const box = (await button.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/** 页面没滚：还在点之前滚到的地方（默认最上面），切换按钮还在点之前的地方。 */
async function expectStill(page: Page, before: { top: number }, scrollY = 0): Promise<void> {
  expect(await page.evaluate(() => window.scrollY), "页面没滚").toBe(scrollY);
  const now = await edges(viewGroup(page));
  expect(Math.abs(now.top - before.top), "切换按钮没动").toBeLessThan(1);
}

/** 整个在屏幕里（上下都算）。 */
async function expectOnScreen(page: Page, locator: Locator, name: string): Promise<void> {
  const box = (await locator.boundingBox())!;
  const height = page.viewportSize()!.height;
  expect(box.y, `${name} 的上边`).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height, `${name} 的下边`).toBeLessThanOrEqual(height);
}

/** 页顶那一行钉在屏幕顶上：页顶离上边不到 12 像素，有底色（钉上到下一帧才上色，用会重试的断言）。 */
async function expectBarPinned(page: Page): Promise<void> {
  const top = await edges(page.locator("[data-top-row]"));
  expect(top.top, "页顶的上边").toBeGreaterThanOrEqual(0);
  expect(top.top, "页顶的上边").toBeLessThan(12);
  await expect(topBar(page), "钉住了有底色").not.toHaveCSS("background-color", TRANSPARENT);
}

/** 筛选和切换按钮收起了：切换按钮没在页顶那一行下面露出来。鼠标离开 0.3 秒才收、收的时候还要淡出，等着看。 */
async function expectFolded(page: Page): Promise<void> {
  await expect
    .poll(async () => (await edges(viewGroup(page))).bottom - (await edges(topBar(page))).bottom, {
      message: "切换按钮收起来了",
      timeout: 1000,
    })
    .toBeLessThanOrEqual(1);
}

/** 筛选和切换按钮弹出来了：切换按钮整个在屏幕里，在页顶那一行下面、离它不到 80 像素（弹出来有 0.15 秒的下滑，等着看）。 */
async function expectShown(page: Page): Promise<void> {
  await expect
    .poll(
      async () => {
        const below = (await edges(viewGroup(page))).top - (await edges(topBar(page))).bottom;
        return below >= -1 && below <= 80;
      },
      { message: "切换按钮弹出来、在页顶那一行下面" },
    )
    .toBe(true);
  await expectOnScreen(page, viewGroup(page), "切换按钮");
}

/** 切过去滚到了新视图的开头：页顶离上边不到 12 像素，新视图紧挨着切换按钮那一行（往下 32 像素以内）。 */
async function expectViewRightBelow(page: Page, view: Locator): Promise<void> {
  const top = await edges(page.locator("[data-top-row]"));
  expect(top.top, "页顶的上边").toBeGreaterThanOrEqual(0);
  expect(top.top, "页顶的上边").toBeLessThan(12);
  const next = (await edges(view)).top - (await edges(page.locator("[data-view-row]"))).bottom;
  expect(next, "新视图离切换按钮那一行").toBeGreaterThanOrEqual(0);
  expect(next, "新视图离切换按钮那一行").toBeLessThanOrEqual(32);
}

/** 鼠标移到页顶那一行上（左边空着的地方）。 */
async function hoverBar(page: Page): Promise<void> {
  const box = (await topBar(page).boundingBox())!;
  await page.mouse.move(box.x + 8, box.y + box.height / 2);
}

/** 鼠标移到屏幕中间偏下：不在页顶那一行、也不在弹出来那截上。 */
async function moveAway(page: Page): Promise<void> {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width / 2, size.height / 2 + 100);
}

/** 往下滚到 10.3（真的滚了一大截）。 */
async function scrollToDay3(page: Page): Promise<void> {
  await page.getByRole("table", { name: DAY3 }).evaluate((element) => element.scrollIntoView({ block: "start" }));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
}

test("手机上：打开是时间线 → 页面在最上面时和原来一样、点切换不跳 → 滚下去只剩页顶那一行 → 鼠标移上去弹出来、点「日程」回到开头 → 弹出来点「时间线」从开头看起 → 重新打开还是上次看的", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  const views = viewGroup(page);

  // 打开就是时间线；页面在最上面：页顶离上边 32 像素（和还没加天时一样）、没有底色
  await expect(views.getByRole("button", { name: "时间线", pressed: true })).toBeVisible();
  expect(Math.abs((await edges(page.locator("[data-top-row]"))).top - 32), "页顶离上边 32 像素").toBeLessThan(1);
  await expect(topBar(page), "没钉住时没有底色").toHaveCSS("background-color", TRANSPARENT);
  // 页面在最上面时点切换：页面不滚，切换按钮留在原处（你提的：上面只剩两行，维持不动就行）
  const before = await edges(views);
  expect(before.top, "切换按钮本来就在第一屏").toBeGreaterThan(40);
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expect(views.getByRole("button", { name: "时间线", pressed: true })).toBeVisible();
  await expectStill(page, before);
  await shot(page, "01-phone-timeline");
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expect(views.getByRole("button", { name: "日程", pressed: true })).toBeVisible();
  await expectStill(page, before);

  // 完成一件：筛选那一行出现「只看没完成的」
  await (await rowOf(page.getByRole("table", { name: DAY1 }), "西湖")).getByRole("button", { name: /^标记：/ }).click();

  // 往下滚到 10.3：只剩页顶那一行钉在顶上（「撤销」点得到），筛选和切换按钮收起（你提的：要 B，折叠）
  await moveAway(page);
  await scrollToDay3(page);
  await expectBarPinned(page);
  await expectOnScreen(page, page.getByRole("button", { name: "撤销" }), "撤销");
  await expectFolded(page);
  await shot(page, "02-phone-folded", { screen: true });

  // 鼠标移到页顶那一行上：弹出来，页面不滚（你提的：鼠标在上面区域的时候，就自动弹出来）
  const scrolled = await page.evaluate(() => window.scrollY);
  await hoverBar(page);
  await expectShown(page);
  expect(await page.evaluate(() => window.scrollY), "页面没滚").toBe(scrolled);
  await expectOnScreen(page, page.getByRole("group", { name: "按标记筛选" }).getByRole("button", { name: "确定" }), "标记里的「确定」");
  await shot(page, "03-phone-shown", { screen: true });

  // 弹出来时点按下的「日程」：回到开头，页顶、筛选、切换按钮都在原处
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expectViewRightBelow(page, page.getByRole("list", { name: "日期列表" }));

  // 再滚下去，弹出来点「时间线」：时间线从开头看起（不停在日程滚到的地方）
  await moveAway(page);
  await scrollToDay3(page);
  await hoverBar(page);
  await expectShown(page);
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expectViewRightBelow(page, page.getByRole("region", { name: "时间线" }));
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));

  // 切到日程、重新打开：还是日程（默认是时间线，所以这一下才看得出记住了）
  await page.reload();
  await expect(views.getByRole("button", { name: "日程", pressed: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "日期列表" })).toBeVisible();
  await expect(page.getByRole("region", { name: "时间线" })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("手机上走到的输入框不被页顶那一行、停住的「第 1 天」挡住", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 390, 844);
  await clickInPlace(page, viewGroup(page).getByRole("button", { name: "日程" }));
  await moveAway(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const day1 = page.getByRole("table", { name: DAY1 });
  const title = (await rowOf(day1, "西湖")).getByRole("textbox", { name: "标题" });
  await title.evaluate((element) => (element as HTMLElement).focus());
  await expect(title).toBeFocused();
  const box = await edges(title);
  expect(box.top, "标题框在页顶那一行下面").toBeGreaterThanOrEqual((await edges(topBar(page))).bottom - 1);
  const dayHead = page.getByRole("list", { name: "日期列表" }).locator(":scope > li", { has: day1 }).locator("[data-day-side]");
  expect(box.top, "标题框在停住的「第 1 天」下面").toBeGreaterThanOrEqual((await edges(dayHead)).bottom - 1);
  expect(box.bottom, "标题框在屏幕里").toBeLessThanOrEqual(844);

  expect(errors).toEqual([]);
});

test("手机上筛选不折行：五种类型加「标记」三档只占一行，左右滑得到最后一个", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖", "开车", "午饭", "民宿", "买茶"]);
  await pickKind(page, day1, "开车", "交通");
  await pickKind(page, day1, "午饭", "餐饮");
  await pickKind(page, day1, "民宿", "住宿");
  await pickKind(page, day1, "买茶", "购物");
  await (await rowOf(day1, "西湖")).getByRole("button", { name: /^标记：/ }).click();

  const row = page.locator("[data-filter-row]");
  const onlyDecided = page.getByRole("group", { name: "按标记筛选" }).getByRole("button", { name: "确定" });
  await expect(onlyDecided).toBeAttached();
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  // 一行：「只看没完成的」和第一个类型按钮一样高（没折到下一行）；这一行比屏幕宽，能左右滑
  expect(Math.abs((await edges(onlyDecided)).top - (await edges(kinds.getByRole("button").first())).top)).toBeLessThan(2);
  expect(await row.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  await row.evaluate((element) => (element.scrollLeft = element.scrollWidth));
  const box = (await onlyDecided.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "04-phone-filter-row");

  expect(errors).toEqual([]);
});

test("电脑上：页面在最上面、滚了一点时点切换不跳 → 滚下去收起 → 鼠标移上去弹出来、移开收回去 → 点「固定」一直在、变「收起」→ 固定时切到比一屏短的时间线 → 「收起」收回去", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await busyPlan(page, 1280, 800);
  const views = viewGroup(page);

  const before = await edges(views);
  for (const name of ["时间线", "日程", "总览", "日程"]) {
    await clickInPlace(page, views.getByRole("button", { name }));
    await expect(views.getByRole("button", { name, pressed: true })).toBeVisible();
    await expectStill(page, before);
  }

  // 往下滚了一点、页顶那一行还没钉住：照样不滚，切到比一屏短的总览也不动，没有底色
  await page.evaluate(() => window.scrollTo(0, 10));
  const partway = await edges(views);
  await clickInPlace(page, views.getByRole("button", { name: "总览" }));
  await expect(views.getByRole("button", { name: "总览", pressed: true })).toBeVisible();
  await expectStill(page, partway, 10);
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await expectStill(page, partway, 10);
  await expect(topBar(page), "还没钉住，没有底色").toHaveCSS("background-color", TRANSPARENT);

  // 完成一件，滚下去：只剩页顶那一行
  await (await rowOf(page.getByRole("table", { name: DAY1 }), "西湖")).getByRole("button", { name: /^标记：/ }).click();
  await moveAway(page);
  await scrollToDay3(page);
  await expectBarPinned(page);
  await expectOnScreen(page, page.getByRole("button", { name: "撤销" }), "撤销");
  await expectFolded(page);
  await shot(page, "05-desktop-folded", { screen: true });

  // 鼠标移上去弹出来，移开收回去
  await hoverBar(page);
  await expectShown(page);
  await expectOnScreen(page, page.getByRole("group", { name: "按标记筛选" }).getByRole("button", { name: "确定" }), "标记里的「确定」");
  await shot(page, "06-desktop-shown", { screen: true });
  await moveAway(page);
  await expectFolded(page);

  // 点「固定」：移开也不收，滚到最下面还在；按钮变「收起」（你提的：如果点击，就是固定住）
  await hoverBar(page);
  await expectShown(page);
  await clickInPlace(page, page.getByRole("button", { name: "固定筛选和视图" }));
  await moveAway(page);
  await page.waitForTimeout(600);
  await expectShown(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expectShown(page);
  await expect(page.getByRole("button", { name: "收起筛选和视图" })).toBeVisible();
  await expect(page.getByRole("button", { name: "固定筛选和视图" })).toHaveCount(0);
  await shot(page, "07-desktop-pinned", { screen: true });

  // 固定时切到比一屏短的时间线：从开头看起
  await scrollToDay3(page);
  await clickInPlace(page, views.getByRole("button", { name: "时间线" }));
  await expectViewRightBelow(page, page.getByRole("region", { name: "时间线" }));

  // 回日程滚下去，点「收起」、移开：收回去
  await clickInPlace(page, views.getByRole("button", { name: "日程" }));
  await scrollToDay3(page);
  await expectShown(page);
  await clickInPlace(page, page.getByRole("button", { name: "收起筛选和视图" }));
  await moveAway(page);
  await expectFolded(page);

  expect(errors).toEqual([]);
});

test("电脑上用键盘：收起时 Tab 走进筛选，弹出来、焦点所在的按钮看得见", async ({ page }) => {
  const errors = watchErrors(page);
  await busyPlan(page, 1280, 800);
  await clickInPlace(page, viewGroup(page).getByRole("button", { name: "日程" }));
  await (await rowOf(page.getByRole("table", { name: DAY1 }), "西湖")).getByRole("button", { name: /^标记：/ }).click();
  await moveAway(page);
  await scrollToDay3(page);
  await expectFolded(page);

  await page.getByRole("button", { name: "计划设置" }).focus();
  for (let press = 0; press < 6; press++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(() => document.activeElement?.closest("[data-filter-row]") != null)) break;
  }
  const focused = page.locator(":focus");
  await expect(focused).toHaveText("待定");
  await expectOnScreen(page, focused, "焦点所在的按钮");
  expect((await edges(focused)).top, "在页顶那一行下面").toBeGreaterThanOrEqual((await edges(topBar(page))).bottom - 1);

  expect(errors).toEqual([]);
});

test.describe("触屏", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("触屏上：滚下去页顶那一行下面有「展开」→ 点了弹出来、滚到最下面还在 →「收起」收回去、「展开」又出现", async ({ page }) => {
    const errors = watchErrors(page);
    await busyPlan(page, 390, 844);
    // 前面加事是用鼠标点的：把鼠标挪开，免得它停在页顶那一行上、当成鼠标移上去了（真的触屏没有鼠标）
    await moveAway(page);
    const views = viewGroup(page);
    await views.getByRole("button", { name: "日程" }).tap();
    await expect(views.getByRole("button", { name: "日程", pressed: true })).toBeVisible();
    await scrollToDay3(page);

    const expand = page.getByRole("button", { name: "展开筛选和视图" });
    await expect(expand).toBeVisible();
    await expectFolded(page);
    await shot(page, "08-touch-folded", { screen: true });

    await expand.tap();
    await expectShown(page);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expectShown(page);
    await shot(page, "09-touch-shown", { screen: true });

    await page.getByRole("button", { name: "收起筛选和视图" }).tap();
    await expectFolded(page);
    await expect(expand).toBeVisible();

    expect(errors).toEqual([]);
  });
});
