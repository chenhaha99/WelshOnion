import { expect, test, type Page } from "@playwright/test";
import {
  addBlocks,
  axisOf,
  axisPoint,
  box,
  center,
  DAY1,
  DAY2,
  drag,
  newPlan,
  pickKind,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 刻度那一行写着的钟点。 */
async function ticks(page: Page): Promise<string[]> {
  return page.getByRole("region", { name: "时间线" }).locator("[data-hour-tick]").allInnerTexts();
}

test("电脑上：默认折起、块变宽 → 晚到的民宿压在折起那一截 → 早班机不折 → 拖进折起那一截 → 点折起那一截展开、刷新还在、按钮收回", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1Table, ["西湖", "民宿"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await pickKind(page, day1Table, "民宿", "住宿");
  await schedule(page, day1Table, "民宿", "22:00", "10");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const fullDay = page.getByRole("button", { name: "0–24 点" });

  // 默认折起：7 点画到 21 点，两头各一截斜纹
  await expect.poll(() => ticks(page)).toEqual(["7", "8", "10", "12", "14", "16", "18", "20", "21"]);
  await expect(fullDay).toHaveAttribute("aria-pressed", "false");
  await expect(day1.locator("[data-fold]")).toHaveCount(2);
  const foldedWidth = (await box(segment(day1, "西湖"))).width;
  await shot(page, "01-folded");

  // 晚到的民宿：10.1 那段压在右边折起那一截里、画到横轴最右；10.2 那段从横轴最左画起
  const axis1 = await axisOf(day1);
  const innNight = await box(segment(day1, "民宿"));
  expect(innNight.x).toBeGreaterThanOrEqual(axis1.rect.x + axis1.rect.width - 24 - 0.5);
  expect(innNight.x + innNight.width).toBeCloseTo(axis1.rect.x + axis1.rect.width, 0);
  // 压得很窄，名字写不下就截断，不伸出条外面
  const innNightTitle = await box(segment(day1, "民宿").locator("[data-bar-title]"));
  expect(innNightTitle.x + innNightTitle.width).toBeLessThanOrEqual(innNight.x + innNight.width + 0.5);
  const axis2 = await axisOf(day2);
  expect((await box(segment(day2, "民宿"))).x).toBeCloseTo(axis2.rect.x, 0);

  // 按下「0–24 点」：西湖变窄（折起时宽一半以上）；再按回来
  await fullDay.click();
  await expect(fullDay).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => ticks(page)).toEqual(["0", "2", "4", "6", "8", "10", "12", "14", "16", "18", "20", "22", "24"]);
  expect(foldedWidth).toBeGreaterThan((await box(segment(day1, "西湖"))).width * 1.5);
  // 画到 24 点时，最右的「24」写在 24 点那条线左边，不伸出横轴
  const tick24 = await box(page.getByRole("region", { name: "时间线" }).locator("[data-hour-tick]").last());
  const axisFull = await axisOf(day1);
  expect(tick24.x + tick24.width).toBeLessThanOrEqual(axisFull.rect.x + axisFull.rect.width + 0.5);
  await fullDay.click();
  await expect.poll(() => ticks(page)).toEqual(["7", "8", "10", "12", "14", "16", "18", "20", "21"]);

  // 早班机不折：10.2 的航班 05:40 起，每一行都从 5 点画起，航班整个画出来
  await addBlocks(page, day2Table, ["航班"]);
  await schedule(page, day2Table, "航班", "05:40", "2");
  await showView(page, "时间线");
  await expect.poll(async () => (await ticks(page))[0]).toBe("5");
  const flight = await box(segment(day2, "航班"));
  expect(flight.x).toBeGreaterThanOrEqual((await axisOf(day2)).rect.x + 24 - 0.5);

  // 拖进折起的那一截：按住西湖中间往左拖进左边那一截，指针上方的时间就是松手后的时间，横轴展开到画得下它
  const lake = center(await box(segment(day1, "西湖")));
  const into = await axisPoint(day1, 150);
  await drag(page, lake, { x: into.x, y: lake.y }, { release: false });
  const label = page.locator("[data-drag-label]");
  await expect(label).toHaveText(/^0[0-4]:\d\d–0[3-7]:\d\d$/);
  const dropped = await label.innerText();
  await shot(page, "02-drag-into-fold", { dragging: true });
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe(dropped);
  await showView(page, "时间线");
  await expect.poll(async () => (await ticks(page))[0]).toBe(String(Number(dropped.slice(0, 2))));
  await page.keyboard.press("Control+z");
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("09:00–12:00");
  await showView(page, "时间线");
  await expect.poll(async () => (await ticks(page))[0]).toBe("5");

  // 点右边折起的那一截（上边压着民宿那一小段，点下边空着的地方）：展开成 0–24 点；刷新还是；按「0–24 点」收回
  const fold = day1.locator('[data-fold="after"]');
  const foldBox = await box(fold);
  await page.mouse.click(foldBox.x + foldBox.width / 2, foldBox.y + foldBox.height - 4);
  await expect(fullDay).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("[data-fold]")).toHaveCount(0);
  await shot(page, "03-full-day");
  await page.reload();
  await expect(page.getByRole("button", { name: "0–24 点" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "0–24 点" }).click();
  await expect.poll(async () => (await ticks(page))[0]).toBe("5");

  expect(errors).toEqual([]);
});
