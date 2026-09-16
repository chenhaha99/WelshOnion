import { expect, test, type Page } from "@playwright/test";
import {
  addBlocks,
  chip,
  DAY1,
  DAY2,
  newPlan,
  openDetails,
  quickBar,
  rowOf,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机上打开是第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");

async function expectView(page: Page, name: "时间轴" | "列表"): Promise<void> {
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name, pressed: true })).toBeVisible();
}

test("电脑上只在时间轴里：加事 → 点开排时间、挂开销、复制到下一天、推迟 → 删掉另一天的 → 插一天、改时区", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  // 在 10.1 那一行的栏里加「西湖」
  await day1.getByRole("textbox", { name: "加一件事" }).fill("西湖");
  await page.keyboard.press("Enter");
  await expect(chip(day1, "西湖")).toBeVisible();

  // 点开：面板在屏幕右边、320 像素宽；排上 09:00 起 3 小时
  await openDetails(chip(day1, "西湖").getByRole("button"));
  const panel = page.getByRole("dialog", { name: "西湖" });
  const panelBox = (await panel.boundingBox())!;
  expect(Math.round(panelBox.width)).toBe(320);
  expect(panelBox.x + panelBox.width).toBeGreaterThan(1260);
  await panel.getByRole("button", { name: "时间" }).click();
  const time = panel.getByRole("group", { name: "西湖 的时间" });
  await time.getByLabel("开始").fill("09:00");
  await time.getByRole("spinbutton", { name: "小时" }).fill("3");
  await time.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await time.getByRole("button", { name: "排上时间" }).click();
  await expect(panel.getByRole("button", { name: "时间" })).toHaveText("09:00–12:00 · 3 小时");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  // 挂 300 元
  await panel.getByRole("button", { name: "开销" }).click();
  const money = panel.getByRole("group", { name: "西湖 的开销" });
  await money.getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await money.getByRole("button", { name: "收起" }).click();
  await expect(panel.getByRole("button", { name: "开销" })).toHaveText("¥300");

  // 复制到 10.2：面板留着，写着复制到了哪天
  await panel.getByRole("combobox", { name: "复制到" }).selectOption({ label: "第 2 天 · 10.2 周五" });
  await expect(panel).toContainText("复制到了第 2 天 · 10.2 周五");
  await expect(segment(day2, "西湖")).toHaveAttribute("data-from", "540");
  await shot(page, "01-desktop-panel");

  // 推迟 30 分钟：面板关掉，10.1 的挪到 09:30，10.2 的不动
  await panel.getByRole("group", { name: "这天从这件起往后推迟" }).getByRole("button", { name: "30 分钟" }).click();
  await expect(panel).toBeHidden();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "570");
  await expect(segment(day2, "西湖")).toHaveAttribute("data-from", "540");

  // 点开 10.2 的删掉：提示能撤销，焦点落到 10.2 的「这天的操作」
  await openDetails(segment(day2, "西湖").getByRole("button"));
  await page.getByRole("dialog", { name: "西湖" }).getByRole("button", { name: "删除" }).click();
  await expect(segment(day2, "西湖")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "删完的提示" })).toContainText("删掉了「西湖」");
  await expect(day2.getByRole("button", { name: "这天的操作" })).toBeFocused();

  // 每天的菜单：10.1 下面插一天，第 3 天改到东京，选完焦点回到菜单按钮
  await day1.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "在下面插一天" }).click();
  await expect(timeline.getByRole("listitem")).toHaveCount(3);
  const day3 = timeline.getByRole("listitem", { name: /10\.3/ });
  await day3.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "改时区…" }).click();
  await day3.getByRole("combobox", { name: "时区" }).selectOption("Asia/Tokyo");
  await expect(timeline.getByRole("listitem", { name: "第 3 天 · 10.3 周六 · 东京 +1h" })).toBeVisible();
  await expect(day3.getByRole("button", { name: "这天的操作" })).toBeFocused();
  await shot(page, "02-desktop-day-menu");

  // 一直是时间轴视图；到列表里看，改动都在
  await expectView(page, "时间轴");
  const day1Table = page.getByRole("table", { name: /10\.1 周四/ });
  expect(await timeOf(day1Table, "西湖")).toBe("09:30–12:30");
  await expect((await rowOf(day1Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await expect(page.getByRole("table", { name: /10\.3 周六/ }).locator("tr[data-block-id]")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("手机上只在时间轴里：框下面加事 → 点开占满屏幕、排时间 → 点竖条推迟 → 这天的菜单插一天", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 2, { width: 390, height: 844 });
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 1 天 · 10.1 周四");

  // 框下面加「西湖」：出现「没排时间」和它
  await timeline.getByRole("textbox", { name: "加一件事" }).fill("西湖");
  await page.keyboard.press("Enter");
  const tray = timeline.getByRole("group", { name: "没排时间" });
  await expect(tray.getByRole("button", { name: "西湖 整天" })).toBeVisible();

  // 点开：面板占满屏幕；排上 09:00 起 1 小时，关掉
  await openDetails(tray.getByRole("button", { name: "西湖 整天" }));
  const panel = page.getByRole("dialog", { name: "西湖" });
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.y)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.height)).toBe(844);
  await panel.getByRole("button", { name: "时间" }).click();
  const time = panel.getByRole("group", { name: "西湖 的时间" });
  await time.getByLabel("开始").fill("09:00");
  await time.getByRole("spinbutton", { name: "小时" }).fill("1");
  await time.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await time.getByRole("button", { name: "排上时间" }).click();
  await expect(panel.getByRole("button", { name: "时间" })).toHaveText("09:00–10:00 · 1 小时");
  await shot(page, "03-phone-panel");
  await panel.getByRole("button", { name: "关闭" }).click();
  await expect(panel).toBeHidden();
  const lake = segment(timeline, "西湖");
  await expect(lake).toHaveAttribute("data-from", "540");
  await expect(tray).toHaveCount(0);

  // 从详情面板推迟 30 分钟，竖条挪到 09:30
  await openDetails(timeline.getByRole("button", { name: /^西湖 / }));
  await page
    .getByRole("dialog", { name: "西湖" })
    .getByRole("group", { name: "这天从这件起往后推迟" })
    .getByRole("button", { name: "30 分钟" })
    .click();
  await expect(lake).toHaveAttribute("data-from", "570");

  // 这天的菜单：在下面插一天，往后翻两天是第 3 天
  await timeline.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "在下面插一天" }).click();
  await timeline.getByRole("button", { name: "后一天" }).click();
  await timeline.getByRole("button", { name: "后一天" }).click();
  await expect(timeline.locator("[data-timeline-day]")).toHaveText("第 3 天 · 10.3 周六");
  await expectView(page, "时间轴");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  expect(errors).toEqual([]);
});

test("列表里：详情面板里叠放、复制到另一天、推迟 → 时间格里换天", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1Table, ["横店", "明清宫苑", "灵隐寺"]);
  await schedule(page, day1Table, "横店", "08:00", "12");
  await schedule(page, day1Table, "明清宫苑", "10:00", "2");

  // 明清宫苑的「详情…」：叠在横店上，复制到 10.2
  await (await rowOf(day1Table, "明清宫苑")).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "详情…" }).click();
  const palace = page.getByRole("dialog", { name: "明清宫苑" });
  const place = palace.getByRole("combobox", { name: "放在哪" });
  await place.selectOption({ label: "叠在「横店」上" });
  await expect(place.locator("option:checked")).toHaveText("叠在「横店」上");
  await palace.getByRole("combobox", { name: "复制到" }).selectOption({ label: "第 2 天 · 10.2 周五" });
  await expect(palace).toContainText("复制到了第 2 天 · 10.2 周五");
  await shot(page, "04-list-panel");
  await palace.getByRole("button", { name: "关闭" }).click();
  await expect(palace).toBeHidden();

  // 横店推迟 1 小时：叠在上面的明清宫苑跟着走，10.2 复制出来的不动
  await (await rowOf(day1Table, "横店")).getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "详情…" }).click();
  const hengdian = page.getByRole("dialog", { name: "横店" });
  await hengdian.getByRole("group", { name: "这天从这件起往后推迟" }).getByRole("button", { name: "1 小时" }).click();
  await expect(hengdian).toBeHidden();
  await expect.poll(() => timeOf(day1Table, "横店")).toBe("09:00–21:00");
  expect(await timeOf(day1Table, "明清宫苑")).toBe("11:00–13:00");
  expect(await timeOf(day2Table, "明清宫苑")).toBe("10:00–12:00");

  // 灵隐寺没排时间：时间格里「哪天」选 10.2，换过去，焦点在它在 10.2 的「时间」按钮上
  await (await rowOf(day1Table, "灵隐寺")).getByRole("button", { name: "时间" }).click();
  await page
    .getByRole("group", { name: "灵隐寺 的时间" })
    .getByRole("combobox", { name: "哪天" })
    .selectOption({ label: "第 2 天 · 10.2 周五" });
  await expect.poll(() => timeOf(day2Table, "灵隐寺")).toBe("整天");
  await expect((await rowOf(day2Table, "灵隐寺")).getByRole("button", { name: "时间" })).toBeFocused();
  await expectView(page, "列表");

  expect(errors).toEqual([]);
});
