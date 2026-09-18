import { expect, test } from "@playwright/test";
import { openDetails, quickBar, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("跨时区：北京那天加同日期的洛杉矶 → 18:00 起飞 12 小时 → 时间格和详情写两地时刻 → 手机上也一样", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("飞洛杉矶");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("1");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");

  // 北京那天下面加一个同日期、洛杉矶时区的天
  const days = page.getByRole("list", { name: "日期列表" }).getByRole("listitem");
  await expect(days).toHaveCount(1);
  await days.first().getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "加一个另一时区的这天…" }).click();
  await days.first().getByRole("combobox", { name: "时区" }).selectOption("America/Los_Angeles");
  await expect(days).toHaveCount(2);

  // 北京那天加「飞洛杉矶」，排上 18:00 起 12 小时
  const beijing = page.getByRole("table", { name: /北京 的安排/ });
  await beijing.getByRole("textbox", { name: "加一件事" }).fill("飞洛杉矶");
  await page.keyboard.press("Enter");
  const flight = beijing.locator("tr[data-block-id]").first();
  await flight.getByRole("button", { name: "时间" }).click();
  const time = page.getByRole("group", { name: "飞洛杉矶 的时间" });
  await time.getByLabel("开始").fill("18:00");
  await time.getByRole("spinbutton", { name: "小时" }).fill("12");
  await time.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await time.getByRole("button", { name: "排上时间" }).click();
  await expect(flight.locator("[data-block-time]")).toHaveText("北京 18:00 → 洛杉矶 15:00");

  // 时间线上点洛杉矶那一行的横条
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const flightBar = timeline.getByRole("listitem", { name: /洛杉矶/ }).getByRole("button", { name: /^飞洛杉矶 / });
  // 时间不在详情气泡里了（在日程的时间格上）：横条自己的鼠标提示写两地时刻
  await expect(flightBar).toHaveAttribute("title", "飞洛杉矶 北京 18:00 → 洛杉矶 15:00");
  await openDetails(flightBar);
  await shot(page, "01-desktop");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "飞洛杉矶" })).toBeHidden();

  // 手机宽度：日程卡片上的时间格、时间线竖排里点竖条
  await page.setViewportSize({ width: 390, height: 844 });
  await showView(page, "日程");
  await expect(flight.locator("[data-block-time]")).toHaveText("北京 18:00 → 洛杉矶 15:00");
  await showView(page, "时间线");
  // 手机上停不上去也就没有鼠标提示：点一下竖条，快捷条的「时间」写着两地时刻
  await timeline.getByRole("button", { name: /^飞洛杉矶 / }).first().click();
  await expect(quickBar(page, "飞洛杉矶").getByRole("button", { name: "时间：北京 18:00 → 洛杉矶 15:00" })).toBeVisible();
  await shot(page, "02-phone");

  expect(errors).toEqual([]);
});
