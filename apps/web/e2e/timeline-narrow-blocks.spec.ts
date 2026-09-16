import { expect, test } from "@playwright/test";
import { DAY1, addBlocks, box, newPlan, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("窄块：一小时的事标题借右边的空白写全 → 右边挨着下一件就截断 → 拖动条放大到 200% 一小时宽一倍", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖漫步", "灵隐寺"]);
  await schedule(page, table, "西湖漫步", "09:00", "1");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖漫步");
  const title = lake.locator("[data-bar-title]");

  // 右边空着：标题伸出块外，整个写得出来
  const lakeBox = await box(lake);
  const titleBox = await box(title);
  expect(titleBox.width, "标题比块宽（借到了右边的空白）").toBeGreaterThan(lakeBox.width);
  expect(await title.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), "没截断").toBe(true);
  await shot(page, "01-title-overflow");

  // 右边紧挨着下一件：只能写自己这一段那么宽，截断
  await schedule(page, table, "灵隐寺", "10:00", "1");
  await showView(page, "时间轴");
  const tight = await box(segment(day1, "西湖漫步").locator("[data-bar-title]"));
  expect(tight.width, "借不到地方了").toBeLessThanOrEqual(lakeBox.width + 1);
  expect(
    await segment(day1, "西湖漫步")
      .locator("[data-bar-title]")
      .evaluate((element) => element.scrollWidth > element.clientWidth),
    "写不下，截断",
  ).toBe(true);

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

  // 放大后还是画在 09:00–10:00
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-to", "600");

  expect(errors).toEqual([]);
});
