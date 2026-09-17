import { expect, test, type Locator } from "@playwright/test";
import { addBlocks, box, DAY1, newPlan, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 框正中间是第几分钟：竖轴高 24 小时，按竖轴高换算。 */
async function centerMinute(scroller: Locator): Promise<number> {
  return scroller.evaluate((element) => {
    const axisHeight = element.querySelector<HTMLElement>("[data-day-axis]")!.getBoundingClientRect().height;
    // 框上边留了 8 像素（钟点字不被切开）
    return ((element.scrollTop + element.clientHeight / 2 - 8) / axisHeight) * 1440;
  });
}

test("手机上：竖向放大三档 → 放到 200% 正中间的钟点不跳 → 缩到 50% 看全天 → 刷新还在", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date("2026-09-20T02:00:00Z"));
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "午饭"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "午饭", "12:00", "0", "30");
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const scroller = timeline.locator("[data-day-scroll]");
  const axis = timeline.locator("[data-day-axis]");
  const zoom = page.getByRole("group", { name: "竖向放大" });

  // 默认 100%：每小时 48 像素；三个按钮和「块上写」放在一行
  await expect(zoom.getByRole("button", { name: "100%", pressed: true })).toBeVisible();
  expect((await box(axis)).height).toBeCloseTo(24 * 48, 0);
  const blockText = await box(page.getByRole("group", { name: "块上写" }));
  expect(Math.abs((await box(zoom)).y - blockText.y)).toBeLessThan(4);
  // 按钮上的字不被挤成竖着的两行：数字排成了几行
  const lines = await page
    .getByRole("group", { name: "块上写" })
    .getByRole("button", { name: "标题" })
    .evaluate((element) => {
      const range = document.createRange();
      range.selectNodeContents(element);
      return new Set([...range.getClientRects()].map((rect) => Math.round(rect.top))).size;
    });
  expect(lines).toBe(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  // 放到 200%：每小时 96 像素，框正中间的钟点不跳（误差不到 15 分钟）
  const before = await centerMinute(scroller);
  await zoom.getByRole("button", { name: "200%" }).click();
  await expect(zoom.getByRole("button", { name: "200%", pressed: true })).toBeVisible();
  await expect.poll(async () => (await box(axis)).height).toBeCloseTo(24 * 96, 0);
  expect(Math.abs((await centerMinute(scroller)) - before)).toBeLessThan(15);
  await shot(page, "01-phone-zoom-200");

  // 缩到 50%：每小时 24 像素，框里露出的钟头多了一倍
  await zoom.getByRole("button", { name: "50%" }).click();
  await expect.poll(async () => (await box(axis)).height).toBeCloseTo(24 * 24, 0);
  await shot(page, "02-phone-zoom-50");

  // 刷新还是 50%
  await page.reload();
  await showView(page, "时间轴");
  await expect(page.getByRole("group", { name: "竖向放大" }).getByRole("button", { name: "50%", pressed: true })).toBeVisible();

  expect(errors).toEqual([]);
});
