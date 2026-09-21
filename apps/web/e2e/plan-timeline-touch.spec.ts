import { expect, test, type Page } from "@playwright/test";
import { fingerDown, fingerMove, fingerTap, fingerUp, longPress } from "./finger";
import {
  addBlocks,
  axisPoint,
  box,
  center,
  chip,
  DAY1,
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

/** 「现在」固定在出发（10.1）之前：手机上打开时展开第一天 */
const BEFORE_TRIP = new Date("2026-09-20T02:00:00Z");

async function pageScrollY(page: Page): Promise<number> {
  return page.evaluate(() => window.scrollY);
}

// 手机上点一下是选中；长按拿起来拖、把手、捏合见 plan-timeline-phone-drag.spec.ts
test("手机上用手指：点色块选中 → 没排时间的一件点一下选中", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 2, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "河坊街"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  const timeline = page.getByRole("region", { name: "时间线" });
  await showView(page, "时间线");

  // 点一下：选中它，底部浮出快捷条
  await fingerTap(page, center(await box(segment(timeline, "西湖"))));
  await expect(quickBar(page, "西湖")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "西湖")).toBeHidden();

  // 展开那天下面「没排时间」的一件：点一下选中
  const trayChip = timeline.getByRole("group", { name: "没排时间" }).getByRole("button", { name: "河坊街 整天" });
  await trayChip.scrollIntoViewIfNeeded();
  await fingerTap(page, center(await box(trayChip)));
  await expect(quickBar(page, "河坊街")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "河坊街")).toBeHidden();

  // 长按拿起来拖见 plan-timeline-phone-drag.spec.ts

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
  // 斜着挪一点点就行：往上挪太多会进「没排时间」那一条（它在时间线上面），那是另一回事
  await fingerMove(page, lake, { x: lake.x + hour, y: lake.y - 12 });
  await expect(label).toHaveText("10:00–13:00");
  expect(await pageScrollY(page)).toBe(scrollBefore);
  await shot(page, "04-wide-finger", { dragging: true });
  await fingerUp(page);
  // 先看页面没滚，再去读表：读表要切到日程，切换按钮贴着顶时切换页面会滚
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
  const temple = center(await box(chip(page, "灵隐寺")));
  const at14 = await axisPoint(day1, 14 * 60);
  await longPress(page, temple);
  await fingerMove(page, temple, at14);
  await expect(label).toHaveText("14:00–16:00");
  await fingerUp(page);
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toBe("14:00–16:00");

  // 没长按就往下滑：滚的是页面（往回滚），没有预览框。切换按钮贴顶时时间线下面没有别的了，往上滑滚不动，所以往下滑。
  // 放在最后：在时间线上快速滑过以后，Chromium 模拟的手指在一两秒里点不出点击（惯性把那一下吃了），后面再点、再按会不稳
  // 先往下滚到切换按钮贴顶（主版面上面只剩一行筛选，只滚得下去几十像素），够往回滚就行
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const lakeNow = center(await box(segment(day1, "西湖")));
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
