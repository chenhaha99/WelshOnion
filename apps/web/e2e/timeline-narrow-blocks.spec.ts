import { expect, test } from "@playwright/test";
import { DAY1, addBlocks, box, newPlan, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("窄块：一小时的事标题借右边的空白写全 → 右边挨着下一件就截断 → 放大 200% 一小时宽一倍", async ({ page }) => {
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

  // 放大到 200%：一小时的块宽一倍
  const before = (await box(segment(day1, "西湖漫步"))).width;
  const zoom = page.getByRole("group", { name: "横向放大" });
  await zoom.getByRole("button", { name: "放大" }).click();
  await zoom.getByRole("button", { name: "放大" }).click();
  await expect(zoom.getByText("200%")).toBeVisible();
  const after = (await box(segment(day1, "西湖漫步"))).width;
  expect(after).toBeGreaterThan(before * 1.8);
  await shot(page, "02-zoom-200");

  // 放大后还是画在 09:00–10:00
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖漫步")).toHaveAttribute("data-to", "600");

  expect(errors).toEqual([]);
});
