import { expect, test } from "@playwright/test";
import {
  DAY1,
  addBlocks,
  addMoney,
  axisPoint,
  box,
  center,
  chip,
  countRows,
  drag,
  newPlan,
  quickBar,
  schedule,
  segment,
  showView,
  timeOf,
  timelineRow,
  trayOf,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("电脑上：点一下选中 → 快捷条贴着块的右下角 → 改状态、填钱、按住复制拖到第二天、删除", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  // 点一下选中：不开详情面板，块描了边，快捷条贴着块的右下角
  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(segment(day1, "西湖").getByRole("button", { name: /^西湖 /, pressed: true })).toBeVisible();
  const bar = quickBar(page, "西湖");
  const barBox = await box(bar);
  const segBox = await box(segment(day1, "西湖"));
  expect(Math.abs(barBox.x + barBox.width - (segBox.x + segBox.width))).toBeLessThan(2);
  expect(barBox.y).toBeGreaterThanOrEqual(segBox.y + segBox.height - 1);
  await shot(page, "01-quick-bar");

  // 改状态：两下点完，横条变实线，还选中着
  await bar.getByRole("button", { name: "状态：待定" }).click();
  await page.getByRole("dialog", { name: "选择状态" }).getByRole("button", { name: "已确认", exact: true }).click();
  await expect(bar.getByRole("button", { name: "状态：已确认" })).toBeFocused();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-pending", "false");

  // 填钱：小框里填 300 回车
  await bar.getByRole("button", { name: "钱：填钱" }).click();
  await page.getByRole("dialog", { name: "改钱" }).getByRole("textbox", { name: "金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect(bar.getByRole("button", { name: "钱：¥300" })).toBeVisible();
  await expect(page.getByRole("region", { name: "钱的总览" })).toContainText("总额 ¥300");

  // 按住「复制」往下拖到 10.2：横向不动就是同一个时刻；松手前看得见落在哪
  const copy = center(await box(bar.getByRole("button", { name: "复制" })));
  const target = { x: copy.x, y: (await axisPoint(day2, 720)).y };
  await drag(page, copy, target, { release: false });
  await expect(page.getByText("复制 · 09:00–12:00")).toBeVisible();
  await shot(page, "02-copy-drag", { dragging: true });
  await page.mouse.up();

  await expect(segment(day2, "西湖")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");
  // 复制出来的那一份连钱一起复制，接着被选中（先看选中：切到列表数行数会取消选中）
  await expect(quickBar(page, "西湖")).toBeVisible();
  await expect(page.getByRole("region", { name: "钱的总览" })).toContainText("总额 ¥600");
  expect(await countRows(page.getByRole("table", { name: DAY1 }), "西湖")).toBe(1);

  // 删除：屏幕底部出提示，焦点落到这天的操作
  await showView(page, "时间轴");
  await segment(day2, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await quickBar(page, "西湖").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("删掉了「西湖」")).toBeVisible();
  await expect(segment(day2, "西湖")).toBeHidden();
  await shot(page, "03-deleted");

  expect(errors).toEqual([]);
});

test("电脑上：点一下复制就地多一份；块上写钱，点金额就地改", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖", "看潮"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await schedule(page, table, "看潮", "13:00", "0", "15");
  await addMoney(page, table, "西湖", "300");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");

  // 点一下「复制」：同一天同一时刻多一份，放旁边（第 2 道）
  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await quickBar(page, "西湖").getByRole("button", { name: "复制" }).click();
  expect(await countRows(table, "西湖")).toBe(2);
  await showView(page, "时间轴");
  await expect(day1.locator('[data-segment][data-lane="2"]')).toBeVisible();
  await page.keyboard.press("Control+z");
  expect(await countRows(table, "西湖")).toBe(1);

  // 块上写钱：横条上多一行，点了就地改
  await showView(page, "时间轴");
  await page.getByRole("group", { name: "块上写" }).getByRole("button", { name: "标题 + 钱" }).click();
  const money = segment(day1, "西湖").locator("[data-bar-money] button");
  await expect(money).toHaveText("¥300");
  // 钱那一行画在块里面，不许漏到块外面
  const moneyBox = (await money.boundingBox())!;
  const lakeBox = (await segment(day1, "西湖").boundingBox())!;
  expect(moneyBox.y + moneyBox.height).toBeLessThanOrEqual(lakeBox.y + lakeBox.height + 1);
  await shot(page, "04-money-on-blocks");
  await money.click();
  const amount = page.getByRole("dialog", { name: "改钱" }).getByRole("textbox", { name: "金额" });
  await amount.fill("280");
  await page.keyboard.press("Enter");
  await expect(money).toHaveText("¥280");
  expect(await timeOf(table, "西湖")).toBe("09:00–12:00");

  // 15 分钟的块窄得写不下钱，就只写标题
  await showView(page, "时间轴");
  await expect(segment(day1, "看潮").locator("[data-bar-money]")).toBeHidden();

  expect(errors).toEqual([]);
});

test("手机上：竖条选中后，快捷条固定在屏幕底部", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });

  await timeline.getByRole("button", { name: /^西湖 / }).click();
  const bar = quickBar(page, "西湖");
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  expect(844 - (barBox.y + barBox.height)).toBeLessThan(24);
  await shot(page, "05-phone-quick-bar");

  // 手机上也是两下改完状态
  await bar.getByRole("button", { name: "状态：待定" }).click();
  await page.getByRole("dialog", { name: "选择状态" }).getByRole("button", { name: "已确认", exact: true }).click();
  await expect(bar.getByRole("button", { name: "状态：已确认" })).toBeVisible();

  // 栏里没排时间的那一件：快捷条上没有「复制」「推迟」
  await addBlocks(page, table, ["河坊街"]);
  await showView(page, "时间轴");
  await timeline.getByRole("button", { name: /^河坊街 / }).click();
  const streetBar = quickBar(page, "河坊街");
  await expect(streetBar.getByRole("button", { name: "复制" })).toBeHidden();
  await expect(streetBar.getByRole("button", { name: "这天从这件起往后推迟" })).toBeHidden();
  await expect(streetBar.getByRole("button", { name: "详情…" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("栏里的一件：点一下选中，快捷条画在它下面", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["灵隐寺"]);
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");

  await chip(day1, "灵隐寺").getByRole("button").click();
  const bar = quickBar(page, "灵隐寺");
  const barBox = await box(bar);
  const chipBox = await box(chip(day1, "灵隐寺"));
  expect(barBox.y).toBeGreaterThanOrEqual(chipBox.y + chipBox.height - 1);
  await shot(page, "06-tray-quick-bar");

  expect(errors).toEqual([]);
});

test("按住复制拖进「没排时间」栏：原来的不动，那天多一件没排时间的；一步撤销", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  const copy = center(await box(quickBar(page, "西湖").getByRole("button", { name: "复制" })));
  await drag(page, copy, center(await box(trayOf(day2))));

  await expect(chip(day2, "西湖").getByRole("button", { name: "西湖 上午 · 3 小时" })).toBeVisible();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  // 一步撤销：复制出来的那一件没了
  await page.keyboard.press("Control+z");
  await expect(chip(day2, "西湖")).toBeHidden();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  expect(errors).toEqual([]);
});
