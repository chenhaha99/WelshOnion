import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, newPlan, schedule } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 竖排每小时多高（像素），和 DayTimeline 一样 */
const HOUR_HEIGHT = 48;

/** 竖排的框现在滚到最上面是几点（分钟）。 */
async function topMinute(scroller: Locator): Promise<number> {
  return scroller.evaluate((element, hourHeight) => Math.round((element.scrollTop / hourHeight) * 60), HOUR_HEIGHT);
}

async function shownDay(page: Page): Promise<string> {
  return page.getByRole("region", { name: "时间轴" }).locator("[data-timeline-day]").innerText();
}

// 行程 9.13–9.15，「现在」固定在 9.14 14:20（北京）
test("手机上竖着看一天：落在今天、滚到现在 → 翻天滚到第一件事 → 没排时间出现又不见、改块不滚 → 空的一天 → 回到今天 → 宽屏切回横排", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date("2026-09-14T06:20:00Z"));
  await newPlan(page, 3, { startDate: "2026-09-13", width: 390, height: 844 });
  const timeline = page.getByRole("region", { name: "时间轴" });
  const scroller = timeline.locator("[data-day-scroll]");
  const day3Table = page.getByRole("table", { name: /9\.15 周二 的安排/ });

  // 打开落在今天，滚到现在往前 1 小时再往前取到整点；横排不在
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 2 天 · 9.14 周一");
  await expect(timeline.locator("[data-timeline-scroll]")).toHaveCount(0);
  await expect(timeline.getByRole("button", { name: "回到今天" })).toHaveCount(0);
  // 一件事都没有：提示去加第一件事，不提右边的栏和拖；这天没有没排时间的事，框下面什么都没有
  await expect(timeline.getByText("还没有事。加了事、排上时间，就会画在这里", { exact: true })).toBeVisible();
  await expect(timeline.getByRole("group", { name: "没排时间" })).toHaveCount(0);
  expect(await topMinute(scroller)).toBe(13 * 60);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await timeline.scrollIntoViewIfNeeded();
  await shot(page, "01-today");

  // 在 9.15 排一件 09:00 的事，翻过去：往前 30 分钟再取整点，滚到 08:00；「回到今天」出现
  await addBlocks(page, day3Table, ["西湖"]);
  await schedule(page, day3Table, "西湖", "09:00", "3");
  await timeline.getByRole("button", { name: "后一天" }).click();
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 3 天 · 9.15 周二");
  expect(await topMinute(scroller)).toBe(8 * 60);
  await expect(timeline.getByRole("button", { name: "回到今天" })).toBeVisible();
  await expect(timeline.getByRole("button", { name: /^西湖 / })).toBeVisible();
  await timeline.scrollIntoViewIfNeeded();
  await shot(page, "02-next-day");

  // 手动滚到 12:00 在最上面，再给这天排一件 14:00 的事：框不自己滚
  // （框高 28rem、一天 1152 像素，最多滚到 14 点多在最上面，所以挑 12:00）
  await scroller.evaluate((element, hourHeight) => {
    element.scrollTop = 12 * hourHeight;
  }, HOUR_HEIGHT);
  await addBlocks(page, day3Table, ["灵隐寺"]);
  // 刚加上、还没排时间：框下面出现「没排时间」；排上时间后整块不见
  const tray = timeline.getByRole("group", { name: "没排时间" });
  await expect(tray.getByRole("button", { name: "灵隐寺 整天" })).toBeVisible();
  await expect(timeline.getByText("没排时间", { exact: true })).toBeVisible();
  await schedule(page, day3Table, "灵隐寺", "14:00", "2");
  await expect(timeline.getByRole("button", { name: /^灵隐寺 / })).toHaveCount(1);
  await expect(tray).toHaveCount(0);
  expect(await topMinute(scroller)).toBe(12 * 60);

  // 回到今天：又滚到 13:00；再往前翻到空的 9.13：滚到 08:00
  await timeline.getByRole("button", { name: "回到今天" }).click();
  expect(await shownDay(page)).toBe("第 2 天 · 9.14 周一");
  expect(await topMinute(scroller)).toBe(13 * 60);
  await timeline.getByRole("button", { name: "前一天" }).click();
  expect(await shownDay(page)).toBe("第 1 天 · 9.13 周日");
  expect(await topMinute(scroller)).toBe(8 * 60);
  await expect(timeline.getByRole("button", { name: "前一天" })).toBeDisabled();
  // 滚到整点时，最上面那个钟点的字整个露在框里，不被切掉一半
  const scrollerTop = (await scroller.boundingBox())!.y;
  const eightTop = (await timeline.locator("[data-hour-tick]").filter({ hasText: /^8$/ }).boundingBox())!.y;
  expect(eightTop).toBeGreaterThanOrEqual(scrollerTop);

  // 宽屏切回横排：一天一行
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(timeline.locator("[data-timeline-scroll]")).toBeVisible();
  await expect(timeline.getByRole("listitem", { name: /第 \d 天/ })).toHaveCount(3);
  await expect(scroller).toHaveCount(0);

  expect(errors).toEqual([]);
});
