import { expect, test, type Page } from "@playwright/test";
import {
  addBlocks,
  axisPoint,
  box,
  center,
  chip,
  DAY1,
  DAY2,
  drag,
  newPlan,
  openAddBlock,
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

async function expectView(page: Page, name: "时间线" | "日程"): Promise<void> {
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name, pressed: true })).toBeVisible();
}

test("电脑上只在时间线里：加事 → 拖上去排时间、快捷条挂开销、复制到下一天 → 删掉另一天的 → 插一天、改时区", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  // 在 10.1 那一行的「＋」里加「西湖」
  await (await openAddBlock(page, day1)).fill("西湖");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(chip(page, "西湖")).toBeVisible();

  // 从条上拖到 10.1 的 09:00：排上时间（时间就在时间线上改，你提的）
  await drag(page, center(await box(chip(page, "西湖"))), await axisPoint(day1, 9 * 60));
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  // 详情是贴着「详情…」的气泡，只有标题、备注这些；不是占满右边的抽屉
  await openDetails(segment(day1, "西湖").getByRole("button", { name: /^西湖 / }));
  const panel = page.getByRole("dialog", { name: "西湖" });
  await expect(panel.getByLabel("标题")).toHaveValue("西湖");
  await expect(panel.getByRole("button", { name: "时间" })).toHaveCount(0);
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x + panelBox.width).toBeLessThan(1280);
  await shot(page, "01-desktop-panel");
  await page.keyboard.press("Escape");

  // 快捷条上挂 300 元
  const bar = quickBar(page, "西湖");
  await bar.getByRole("button", { name: "开销：填开销" }).click();
  const money = page.getByRole("group", { name: "西湖 的开销" });
  await money.getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(bar.getByRole("button", { name: "开销：¥300" })).toBeVisible();

  // 按住快捷条的「复制」拖到 10.2：原来那件不动，10.2 多一件同一时刻的
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  const copy = center(await box(bar.getByRole("button", { name: "复制" })));
  await drag(page, copy, { x: copy.x, y: day2Axis.y + day2Axis.height / 2 });
  await expect(segment(day2, "西湖")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  // 复制出来的那件接着选中：直接从快捷条删掉，提示能撤销，焦点落到 10.2 的「这天的操作」
  await quickBar(page, "西湖").getByRole("button", { name: "删除" }).click();
  await expect(segment(day2, "西湖")).toHaveCount(0);
  await expect(page.getByRole("status", { name: "刚做完的提示" })).toContainText("删掉了「西湖」");
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

  // 一直是时间线视图；到日程里看，改动都在
  await expectView(page, "时间线");
  const day1Table = page.getByRole("table", { name: /10\.1 周四/ });
  // 条上拖上去、没填过时长的给 1 小时
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–10:00");
  await expect((await rowOf(day1Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await expect(page.getByRole("table", { name: /10\.3 周六/ }).locator("tr[data-block-id]")).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("手机上只在时间线里：展开那天下面加事 → 点开从底部浮起、点暗底关掉 → 快捷条上排时间 → 这天的菜单插一天", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 2, { width: 390, height: 844 });
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const days = timeline.getByRole("list", { name: "每天" }).getByRole("listitem");
  await expect(days.nth(0)).toHaveAttribute("data-open", "true");

  // 展开那天下面加「西湖」：出现「没排时间」和它
  await timeline.getByRole("textbox", { name: "加一件事" }).fill("西湖");
  await page.keyboard.press("Enter");
  const tray = timeline.getByRole("group", { name: "没排时间" });
  await expect(tray.getByRole("button", { name: "西湖 整天" })).toBeVisible();

  // 点开详情：从屏幕底部浮起，左右铺满、贴着底边，上面至少露出两成屏幕；里面只有标题这些，时间、开销在快捷条上
  await openDetails(tray.getByRole("button", { name: "西湖 整天" }));
  const panel = page.getByRole("dialog", { name: "西湖" });
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(390);
  expect(Math.round(box.y + box.height)).toBe(844);
  expect(box.y).toBeGreaterThanOrEqual(844 * 0.2 - 1);
  await expect(panel.getByLabel("标题")).toHaveValue("西湖");
  await expect(panel.getByRole("button", { name: "开销" })).toHaveCount(0);
  await shot(page, "03-phone-panel");
  // 点上面露出来的暗底：关掉
  await page.mouse.click(195, box.y / 2);
  await expect(panel).toBeHidden();

  // 快捷条上的「时间」：排上 09:00 起 1 小时（手机上不能拖，这是排时间的入口）
  const bar = quickBar(page, "西湖");
  await bar.getByRole("button", { name: "时间：整天" }).click();
  const time = page.getByRole("group", { name: "西湖 的时间" });
  await time.getByLabel("开始").fill("09:00");
  await time.getByRole("spinbutton", { name: "小时" }).fill("1");
  await time.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await time.getByRole("button", { name: "排上时间" }).click();
  await expect(days.nth(0).getByRole("button", { name: "西湖 09:00–10:00" })).toBeVisible();
  await expect(tray).toHaveCount(0);
  await expect(bar.getByRole("button", { name: "时间：09:00–10:00" })).toBeVisible();

  // 这天的菜单：在下面插一天，变成三天，原来的第 2 天成了「第 3 天 · 10.3 周六」
  await days.nth(0).getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "在下面插一天" }).click();
  await expect(days).toHaveCount(3);
  await expect(days.nth(2)).toHaveAttribute("aria-label", "第 3 天 · 10.3 周六");
  await expectView(page, "时间线");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  expect(errors).toEqual([]);
});

test("日程里：详情气泡里叠放 → 时间格里换天", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1Table, ["横店", "明清宫苑", "灵隐寺"]);
  await schedule(page, day1Table, "横店", "08:00", "12");
  await schedule(page, day1Table, "明清宫苑", "10:00", "2");

  // 明清宫苑的「详情…」：气泡贴着行菜单弹出，在里面叠到横店上；气泡里没有类型、时间、开销这些行里就有的
  const menuButton = (await rowOf(day1Table, "明清宫苑")).getByRole("button", { name: "这件事的操作" });
  await menuButton.click();
  await page.getByRole("menuitem", { name: "详情…" }).click();
  const palace = page.getByRole("dialog", { name: "明清宫苑" });
  await expect(palace.getByRole("button", { name: "时间" })).toHaveCount(0);
  await expect(palace.getByRole("combobox", { name: "复制到" })).toHaveCount(0);
  const menuBox = (await menuButton.boundingBox())!;
  const palaceBox = (await palace.boundingBox())!;
  expect(Math.abs(palaceBox.y - (menuBox.y + menuBox.height))).toBeLessThan(40);
  const place = palace.getByRole("combobox", { name: "放在哪" });
  await place.selectOption({ label: "叠在「横店」上" });
  await expect(place.locator("option:checked")).toHaveText("叠在「横店」上");
  await shot(page, "04-list-panel");
  await palace.getByRole("button", { name: "关闭" }).click();
  await expect(palace).toBeHidden();

  // 灵隐寺没排时间：时间格里「哪天」选 10.2，换过去，焦点在它在 10.2 的「时间」按钮上
  await (await rowOf(day1Table, "灵隐寺")).getByRole("button", { name: "时间" }).click();
  await page
    .getByRole("group", { name: "灵隐寺 的时间" })
    .getByRole("combobox", { name: "哪天" })
    .selectOption({ label: "第 2 天 · 10.2 周五" });
  await expect.poll(() => timeOf(day2Table, "灵隐寺")).toBe("整天");
  await expect((await rowOf(day2Table, "灵隐寺")).getByRole("button", { name: "时间" })).toBeFocused();
  await expectView(page, "日程");

  expect(errors).toEqual([]);
});
