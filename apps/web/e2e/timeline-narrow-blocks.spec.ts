import { expect, test } from "@playwright/test";
import { DAY1, addBlocks, box, newPlan, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("窄块：一小时的事标题截断不外溢 → 鼠标提示写全名 → 拖动条放大到 200% 一小时宽一倍", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖漫步", "灵隐寺"]);
  await schedule(page, table, "西湖漫步", "09:00", "1");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖漫步");
  const title = lake.locator("[data-bar-title]");

  // 一小时的块写不下四个字：截断加「…」，标题不伸出块外（右边空着也不伸）
  const lakeBox = await box(lake);
  const titleBox = await box(title);
  expect(titleBox.x + titleBox.width, "标题不伸出块外").toBeLessThanOrEqual(lakeBox.x + lakeBox.width + 1);
  expect(
    await title.evaluate((element) => element.scrollWidth > element.clientWidth),
    "写不下，截断",
  ).toBe(true);
  // 看全名：鼠标停上去的提示
  await expect(lake.getByRole("button", { name: /^西湖漫步 / })).toHaveAttribute("title", "西湖漫步 09:00–10:00");
  await shot(page, "01-title-clipped");

  // 右边紧挨着下一件也一样：不占别人的地方
  await schedule(page, table, "灵隐寺", "10:00", "1");
  await showView(page, "时间轴");
  const tight = await box(segment(day1, "西湖漫步").locator("[data-bar-title]"));
  expect(tight.width, "还是自己那么宽").toBeLessThanOrEqual(lakeBox.width + 1);

  // 拖动条往右拖：倍数跟着变
  const before = (await box(segment(day1, "西湖漫步"))).width;
  const zoom = page.getByRole("slider", { name: "横向放大" });
  const track = await box(zoom);
  await page.mouse.move(track.x + track.width / 4, track.y + track.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + track.width / 2, track.y + track.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(zoom).not.toHaveValue("100");

  // 键盘也能拖：Home 回到 100%，方向键一档 10%，按 10 下正好 200%
  await zoom.focus();
  await page.keyboard.press("Home");
  await expect(zoom).toHaveValue("100");
  for (let step = 0; step < 10; step += 1) await page.keyboard.press("ArrowRight");
  await expect(zoom).toHaveValue("200");
  await expect(page.getByText("200%")).toBeVisible();
  const after = (await box(segment(day1, "西湖漫步"))).width;
  expect(after).toBeGreaterThan(before * 1.8);
  await shot(page, "02-zoom-200");

  // 放大后横向滚到 20 点：第一列（日期、这天的菜单、加一件事）钉在左边，还在屏幕里（你提的）
  const scroller = page.locator("[data-timeline-scroll]");
  await scroller.evaluate((element) => {
    element.scrollLeft = element.scrollWidth * 0.75;
  });
  const first = (await day1.getByText("10.1 周四").boundingBox())!;
  const scrollerBox = (await scroller.boundingBox())!;
  expect(first.x, "第一列还在屏幕里").toBeGreaterThanOrEqual(0);
  expect(first.x - scrollerBox.x, "第一列钉在卡片左边").toBeLessThanOrEqual(12);
  await expect(day1.getByRole("button", { name: "加一件事" })).toBeInViewport();
  await shot(page, "03-sticky-first-column");
  await scroller.evaluate((element) => {
    element.scrollLeft = 0;
  });

  // 放大后还是画在 09:00–10:00
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-to", "600");

  expect(errors).toEqual([]);
});
