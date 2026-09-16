import { expect, test, type Locator, type Page } from "@playwright/test";
import { fingerCancel, fingerDown, fingerMove, fingerTap, fingerUp, longPress } from "./finger";
import {
  addBlocks,
  axisPoint,
  box,
  center,
  chip,
  DAY1,
  DAY2,
  DAY3,
  drag,
  hourWidth,
  keepUndated,
  newPlan,
  quickBar,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test.use({ hasTouch: true });

/** 竖排每小时多高（像素），和 DayTimeline 一样 */
const HOUR_HEIGHT = 48;
/** 「现在」固定在出发（10.1）之前：窄屏打开时落在第一天 */
const BEFORE_TRIP = new Date("2026-09-20T02:00:00Z");

async function scrollTopOf(scroller: Locator): Promise<number> {
  return scroller.evaluate((element) => element.scrollTop);
}

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

/** 等两帧：框边自己滚是每帧滚一次，读位置前让已经排下的那一帧跑完。 */
async function twoFrames(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

test("手机上用手指：长按拿起 → 挪晚 1 小时 → 点一下开详情 → 长按不挪就抬起 → 没长按就滑是滚框 → 框下面的事拿不起来", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 2, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "河坊街"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const scroller = timeline.locator("[data-day-scroll]");
  const lifted = timeline.locator("[data-lifted]");
  const label = page.locator("[data-drag-label]");
  const lakeDetails = page.getByRole("dialog", { name: "西湖" });

  // 按住 0.5 秒拿起来：还没挪就画成拿起来的样子，手指上方写着现在的时间
  const lake = center(await box(segment(timeline, "西湖")));
  await longPress(page, lake);
  await expect(lifted).toHaveCount(1);
  await expect(label).toHaveText("09:00–12:00");
  const labelBox = (await label.boundingBox())!;
  expect(labelBox.y + labelBox.height).toBeLessThan(lake.y - 20);
  await expect(segment(timeline, "西湖")).toHaveAttribute("data-lifted", "true");

  // 往下挪 1 小时：竖条画在 10:00–13:00；抬起才写进计划，不开详情
  await fingerMove(page, lake, { x: lake.x, y: lake.y + HOUR_HEIGHT });
  await expect(label).toHaveText("10:00–13:00");
  await expect(segment(timeline, "西湖")).toHaveAttribute("data-from", "600");
  await expect(segment(timeline, "西湖")).toHaveAttribute("data-to", "780");
  await shot(page, "01-phone-lifted", { dragging: true });
  await fingerUp(page);
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect(lifted).toHaveCount(0);
  await expect(label).toHaveCount(0);
  await expect(lakeDetails).toHaveCount(0);

  // 点一下：选中它
  await fingerTap(page, center(await box(segment(timeline, "西湖"))));
  await expect(quickBar(page, "西湖")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "西湖")).toBeHidden();

  // 长按不挪就抬起：不改、不开详情
  // 按住时整个页面不能选字（iOS 长按会选中旁边的字）、系统长按菜单被拦下，抬起后恢复选字。
  // Chromium 模拟的手指不会触发浏览器自己的长按，真的菜单和选字要在真手机上看；这里查拦的那两处
  await longPress(page, center(await box(segment(timeline, "西湖"))));
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).userSelect)).toBe("none");
  expect(
    await segment(timeline, "西湖").evaluate(
      (frame) => !frame.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })),
    ),
  ).toBe(true);
  await fingerUp(page);
  await expect(lifted).toHaveCount(0);
  await expect(lakeDetails).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).userSelect)).not.toBe("none");

  // 没长按就往上滑：滚的是框，没有预览框，时间不变
  const scrolledBefore = await scrollTopOf(scroller);
  const lakeNow = center(await box(segment(timeline, "西湖")));
  await fingerDown(page, lakeNow);
  await fingerMove(page, lakeNow, { x: lakeNow.x, y: lakeNow.y - 150 }, 10);
  await fingerUp(page);
  await expect.poll(() => scrollTopOf(scroller)).toBeGreaterThan(scrolledBefore);
  await expect(lifted).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");

  // 框下面「没排时间」的一件：长按拿不起来；点一下照样开详情
  const tray = timeline.getByRole("group", { name: "没排时间" });
  await longPress(page, center(await box(tray.getByRole("button", { name: "河坊街 整天" }))));
  await expect(lifted).toHaveCount(0);
  await expect(label).toHaveCount(0);
  await fingerUp(page);
  await page.keyboard.press("Escape");
  expect(await timeOf(day1Table, "河坊街")).toBe("整天");
  await fingerTap(page, center(await box(tray.getByRole("button", { name: "河坊街 整天" }))));
  await expect(quickBar(page, "河坊街")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "河坊街")).toBeHidden();

  // 拿起来拖着的时候浏览器取消了触摸（来电、系统手势）：放弃，预览框和时间都不见，计划不变，页面恢复选字
  // 前面滑过框，西湖可能有一截滚出了框，先滚进来再量
  await segment(timeline, "西湖").scrollIntoViewIfNeeded();
  const lakeAgain = center(await box(segment(timeline, "西湖")));
  await longPress(page, lakeAgain);
  await fingerMove(page, lakeAgain, { x: lakeAgain.x, y: lakeAgain.y + HOUR_HEIGHT });
  await expect(label).toHaveText("11:00–14:00");
  await fingerCancel(page);
  await expect(lifted).toHaveCount(0);
  await expect(label).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).userSelect)).not.toBe("none");

  // 拿起来的时候转成宽屏（竖排卸掉了）：时间不见，页面恢复选字，计划不变
  // 最后取消触摸而不是抬起：抬起时手指下面换成了宽屏的别的东西，会被点到
  const lakeHeld = center(await box(segment(timeline, "西湖")));
  await longPress(page, lakeHeld);
  await expect(label).toHaveCount(1);
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(timeline.locator("[data-timeline-scroll]")).toBeVisible();
  await expect(label).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).userSelect)).not.toBe("none");
  await fingerCancel(page);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");

  expect(errors).toEqual([]);
});

test("手机上：拖到框边自己滚、回到中间就停 → 鼠标拖：不换天、叠上去", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 3, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  const day3Table = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, day1Table, ["灵隐寺"]);
  await schedule(page, day1Table, "灵隐寺", "09:00", "1");
  await addBlocks(page, day2Table, ["夜宵"]);
  await schedule(page, day2Table, "夜宵", "22:00", "1");
  await addBlocks(page, day3Table, ["横店", "明清宫苑"]);
  await schedule(page, day3Table, "横店", "08:00", "12");
  await schedule(page, day3Table, "明清宫苑", "10:00", "2");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const scroller = timeline.locator("[data-day-scroll]");
  const label = page.locator("[data-drag-label]");

  // 框滚到 08:00 在最上面；长按灵隐寺，挪到框的下边上：框往下滚
  await showView(page, "时间轴");
  await scroller.evaluate((element, hourHeight) => {
    element.scrollTop = 8 * hourHeight;
  }, HOUR_HEIGHT);
  const temple = center(await box(segment(timeline, "灵隐寺")));
  const frame = await box(scroller);
  const bottomEdge = { x: temple.x, y: frame.y + frame.height - 4 };
  const middle = { x: temple.x, y: frame.y + frame.height / 2 };
  const startedAt = await scrollTopOf(scroller);
  await longPress(page, temple);
  await fingerMove(page, temple, bottomEdge);
  await expect.poll(() => scrollTopOf(scroller)).toBeGreaterThan(startedAt + HOUR_HEIGHT);

  // 手指回到框中间：框停下
  await fingerMove(page, bottomEdge, middle, 4);
  await twoFrames(page);
  const stoppedAt = await scrollTopOf(scroller);
  await page.waitForTimeout(300);
  expect(await scrollTopOf(scroller)).toBe(stoppedAt);

  // 再挪到下边上：一直滚到底，时间跟着变晚；抬起后开始时刻晚于 22:00
  await fingerMove(page, middle, bottomEdge, 4);
  await expect
    .poll(() => scroller.evaluate((element) => element.scrollTop + element.clientHeight >= element.scrollHeight - 1))
    .toBe(true);
  await expect(label).toHaveText(/^(22:(15|30|45)|23:(00|15|30|45))–/);
  await shot(page, "02-phone-edge-scroll", { dragging: true });
  await fingerUp(page);
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toMatch(/^(22:(15|30|45)|23:(00|15|30|45))–/);

  // 鼠标，不换天：翻到 10.2，把夜宵往下拖 3 小时，开始夹在 23:45，还在 10.2
  await timeline.getByRole("button", { name: "后一天" }).click();
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 2 天 · 10.2 周五");
  await scroller.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const supper = center(await box(segment(timeline, "夜宵")));
  await drag(page, supper, { x: supper.x, y: supper.y + 3 * HOUR_HEIGHT });
  await expect.poll(() => timeOf(day2Table, "夜宵")).toBe("23:45–10.3 00:45");

  // 鼠标，叠上去：翻到 10.3，把明清宫苑横着拖到横店上，拖的时候横店描边；松手后在第 1 列、缩 1 级
  await timeline.getByRole("button", { name: "后一天" }).click();
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 3 天 · 10.3 周六");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-lane", "2");
  // 夜宵拖过了午夜，后半段是 10.3 最早的事，翻过来时框滚到 00:00：先把明清宫苑滚进框里再量
  await segment(timeline, "明清宫苑").scrollIntoViewIfNeeded();
  const palace = center(await box(segment(timeline, "明清宫苑")));
  const hengdian = await box(segment(timeline, "横店"));
  await drag(page, palace, { x: hengdian.x + hengdian.width / 2, y: palace.y }, { release: false });
  await expect(segment(timeline, "横店")).toHaveAttribute("data-drop-target", "true");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-lane", "1");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-depth", "1");
  await shot(page, "03-phone-drop-onto", { dragging: true });
  await page.mouse.up();
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-lane", "1");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-depth", "1");

  // 鼠标，放旁边：把叠上去的明清宫苑横着拖到横店竖条的右边上（从左往右 85%），还没松手就画在第 2 列、不缩；松手后一样
  const nested = center(await box(segment(timeline, "明清宫苑")));
  const wholeHengdian = await box(segment(timeline, "横店"));
  await drag(page, nested, { x: wholeHengdian.x + wholeHengdian.width * 0.85, y: nested.y }, { release: false });
  await expect(timeline.locator('[data-drop-target="true"]')).toHaveCount(0);
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-lane", "2");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-depth", "0");
  await shot(page, "04-phone-drop-beside", { dragging: true });
  await page.mouse.up();
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-lane", "2");
  await expect(segment(timeline, "明清宫苑")).toHaveAttribute("data-depth", "0");
  expect(await timeOf(day3Table, "明清宫苑")).toBe("10:00–12:00");

  expect(errors).toEqual([]);
});

test("宽屏上用手指：长按拖横条、页面不跟着滚 → 点一下、长按不挪 → 栏里的一件长按拖到横轴 → 没长按就滑是滚页面", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "灵隐寺"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await keepUndated(page, day1Table, "灵隐寺", undefined, "2");
  const day1 = timelineRow(page, "10.1");
  const hour = await hourWidth(day1);
  const lifted = page.locator("[data-lifted]");
  const label = page.locator("[data-drag-label]");

  // 长按拿起：画成拿起来的样子，时间写在手指上方；斜着挪 1 小时，页面不跟着滚
  const lake = center(await box(segment(day1, "西湖")));
  const scrollBefore = await pageScrollY(page);
  await longPress(page, lake);
  await expect(label).toHaveText("09:00–12:00");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-lifted", "true");
  await fingerMove(page, lake, { x: lake.x + hour, y: lake.y - 60 });
  await expect(label).toHaveText("10:00–13:00");
  expect(await pageScrollY(page)).toBe(scrollBefore);
  await shot(page, "04-wide-finger", { dragging: true });
  await fingerUp(page);
  // 先看页面没滚，再去读表：读表要切到列表，切换时页面会滚
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "600");
  expect(await pageScrollY(page)).toBe(scrollBefore);
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect(page.getByRole("dialog", { name: "西湖" })).toHaveCount(0);

  // 点一下：选中它；长按不挪就抬起：不改、也不选中
  const lakeBar = quickBar(page, "西湖");
  await fingerTap(page, center(await box(segment(day1, "西湖"))));
  await expect(lakeBar).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(lakeBar).toBeHidden();
  await longPress(page, center(await box(segment(day1, "西湖"))));
  await fingerUp(page);
  await expect(lifted).toHaveCount(0);
  await expect(lakeBar).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");

  // 栏里的一件：长按 0.5 秒拿起，拖到 10.1 那一行的 14:00 处
  const temple = center(await box(chip(day1, "灵隐寺")));
  const at14 = await axisPoint(day1, 14 * 60);
  await longPress(page, temple);
  await fingerMove(page, temple, at14);
  await expect(label).toHaveText("14:00–16:00");
  await fingerUp(page);
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toBe("14:00–16:00");

  // 没长按就往下滑：滚的是页面（往回滚），没有预览框。切换按钮贴顶时时间轴下面没有别的了，往上滑滚不动，所以往下滑。
  // 放在最后：在时间轴上快速滑过以后，Chromium 模拟的手指在一两秒里点不出点击（惯性把那一下吃了），后面再点、再按会不稳
  const lakeNow = center(await box(segment(day1, "西湖")));
  // 主版面上面只剩一行筛选，切换按钮贴顶时页面只滚下去几十像素，够往回滚就行
  const beforeSwipe = await pageScrollY(page);
  expect(beforeSwipe).toBeGreaterThan(10);
  await fingerDown(page, lakeNow);
  await fingerMove(page, lakeNow, { x: lakeNow.x, y: lakeNow.y + 200 }, 10);
  await fingerUp(page);
  await expect.poll(() => pageScrollY(page)).toBeLessThan(beforeSwipe);
  await expect(lifted).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("10:00–13:00");

  expect(errors).toEqual([]);
});
