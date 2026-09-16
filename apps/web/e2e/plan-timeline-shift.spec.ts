import { expect, test, type Locator } from "@playwright/test";
import { addBlocks, DAY1, newPlan, openDetails, quickBar, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

const SHIFT = "这天从这件起往后推迟";

/** 时间轴里读屏名以「title 」开头的那一段，从第几分钟画到第几分钟。 */
async function span(timeline: Locator, title: string): Promise<[number, number]> {
  const segment = timeline
    .locator("[data-segment]")
    .filter({ has: timeline.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
  return [Number(await segment.getAttribute("data-from")), Number(await segment.getAttribute("data-to"))];
}

// 「现在」固定在 9.14，行程 10.1 还没出发：手机上打开是第一天
test("推迟：手机上从详情面板推迟 30 分钟 → 再推 15 分钟 → 前面的不动 → 撤销一次 → 电脑上也在面板里", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(new Date("2026-09-14T06:20:00Z"));
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  const timeline = page.getByRole("region", { name: "时间轴" });
  await addBlocks(page, table, ["西湖", "午饭", "灵隐寺"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await schedule(page, table, "午饭", "12:00", "1");
  await schedule(page, table, "灵隐寺", "14:00", "2");
  await showView(page, "时间轴");

  // 选中午饭、从快捷条的「详情…」开面板、在面板里推迟 30 分钟：午饭和灵隐寺往后挪，西湖不动
  const lunch = timeline.getByRole("button", { name: /^午饭 / });
  // 快捷条上没有推迟（你说「似乎没什么用」）：能力留在详情面板里
  await lunch.click();
  await expect(quickBar(page, "午饭").getByRole("button", { name: SHIFT })).toHaveCount(0);
  const shiftIn = (title: string) => page.getByRole("dialog", { name: title }).getByRole("group", { name: SHIFT });
  await openDetails(lunch);
  await expect(shiftIn("午饭")).toBeVisible();
  await shot(page, "01-phone-panel");
  await shiftIn("午饭").getByRole("button", { name: "30 分钟" }).click();
  await expect.poll(() => span(timeline, "午饭")).toEqual([750, 810]);
  expect(await span(timeline, "灵隐寺")).toEqual([870, 990]);
  expect(await span(timeline, "西湖")).toEqual([540, 720]);

  // 再推 15 分钟
  await openDetails(timeline.getByRole("button", { name: /^午饭 / }));
  await shiftIn("午饭").getByRole("button", { name: "15 分钟" }).click();
  await expect.poll(() => span(timeline, "午饭")).toEqual([765, 825]);
  expect(await span(timeline, "灵隐寺")).toEqual([885, 1005]);
  expect(await span(timeline, "西湖")).toEqual([540, 720]);
  await timeline.scrollIntoViewIfNeeded();
  await shot(page, "02-phone-after");

  // 撤销一次：回到只推了 30 分钟
  await page.getByRole("button", { name: "撤销" }).click();
  await expect.poll(() => span(timeline, "午饭")).toEqual([750, 810]);
  expect(await span(timeline, "灵隐寺")).toEqual([870, 990]);

  // 电脑宽度上：详情面板里也有这一组
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(timeline.locator("[data-timeline-scroll]")).toBeVisible();
  await openDetails(timeline.getByRole("button", { name: /^午饭 / }));
  await expect(page.getByRole("dialog", { name: "午饭" }).getByRole("group", { name: SHIFT })).toBeVisible();
  await shot(page, "03-desktop-panel");

  expect(errors).toEqual([]);
});
