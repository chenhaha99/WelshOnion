import { expect, test } from "@playwright/test";
import {
  addBlocks,
  addMoney,
  axisPoint,
  box,
  center,
  chip,
  countRows,
  DAY1,
  drag,
  inOverview,
  newPlan,
  quickBar,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
  tray,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("电脑上：点一下选中 → 快捷条贴着块的右下角 → 划掉再取消、填开销、按住复制拖到第二天、删除", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  // 点一下选中：不开详情面板，块描了边，快捷条贴着块的右下角
  // 先量一下块本身：选中前后大小一点不变（描边画在块里面；描在外面会和挨着的块叠在一起，你提的）
  const barBefore = await box(segment(day1, "西湖").getByRole("button", { name: /^西湖 / }));
  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  const barAfter = await box(segment(day1, "西湖").getByRole("button", { name: /^西湖 / }));
  expect(Math.round(barAfter.width)).toBe(Math.round(barBefore.width));
  expect(Math.round(barAfter.height)).toBe(Math.round(barBefore.height));
  expect(Math.round(barAfter.x)).toBe(Math.round(barBefore.x));
  expect(Math.round(barAfter.y)).toBe(Math.round(barBefore.y));
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(segment(day1, "西湖").getByRole("button", { name: /^西湖 /, pressed: true })).toBeVisible();
  const bar = quickBar(page, "西湖");
  const barBox = await box(bar);
  const segBox = await box(segment(day1, "西湖"));
  expect(Math.abs(barBox.x + barBox.width - (segBox.x + segBox.width))).toBeLessThan(2);
  expect(barBox.y).toBeGreaterThanOrEqual(segBox.y + segBox.height - 1);
  await shot(page, "01-quick-bar");

  // 标记转一圈：定了 → 划掉 → 待定 → 定了，横条跟着变，还选中着、焦点留在按钮上
  const strike = bar.getByRole("button", { name: /^标记：/ });
  await strike.click();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-mark", "struck");
  await expect(strike).toBeFocused();
  await strike.click();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-mark", "pending");
  await strike.click();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-mark", "decided");

  // 填开销：小框里填 300 回车
  await bar.getByRole("button", { name: "开销：填开销" }).click();
  await page.getByRole("dialog", { name: "改开销" }).getByRole("textbox", { name: "金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect(bar.getByRole("button", { name: "开销：¥300" })).toBeVisible();
  await inOverview(page, ({ total }) => expect(total).toHaveText("¥300"));

  // 切去总览看一眼再回来，选中就没了（切视图会取消选中）：重新点一下
  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await expect(bar).toBeVisible();

  // 按住「复制」往下拖到 10.2：横向不动就是同一个时刻；松手前看得见落在哪
  // 往下拖到 10.2 那一行（快捷条浮在上面、盖着下一行，所以按这件事自己那一行算拖了几天）。
  // 先量行、最后量按钮：box() 会把时间线滚进屏幕，先量按钮的话坐标会过期
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  const copy = center(await box(bar.getByRole("button", { name: "复制" })));
  const target = { x: copy.x, y: day2Axis.y + day2Axis.height / 2 };
  await drag(page, copy, target, { release: false });
  await expect(page.getByText("复制 · 09:00–12:00")).toBeVisible();
  await shot(page, "02-copy-drag", { dragging: true });
  await page.mouse.up();

  await expect(segment(day2, "西湖")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");
  // 复制出来的那一份连开销一起复制，接着被选中（先看选中：切到日程数行数会取消选中）
  await expect(quickBar(page, "西湖")).toBeVisible();
  await inOverview(page, ({ total }) => expect(total).toHaveText("¥600"));
  expect(await countRows(page.getByRole("table", { name: DAY1 }), "西湖")).toBe(1);

  // 删除：屏幕底部出提示，焦点落到这天的操作
  await showView(page, "时间线");
  await segment(day2, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await quickBar(page, "西湖").getByRole("button", { name: "删除" }).click();
  await expect(page.getByText("删掉了「西湖」")).toBeVisible();
  await expect(segment(day2, "西湖")).toBeHidden();
  await shot(page, "03-deleted");

  expect(errors).toEqual([]);
});

test("电脑上：选中最后一行的事，快捷条整个露出来，时间线不会被撑得能竖着滚", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day2Table = page.getByRole("table", { name: /10\.2 周五 的安排/ });
  await addBlocks(page, day2Table, ["夜游"]);
  await schedule(page, day2Table, "夜游", "19:00", "2");
  await showView(page, "时间线");
  const scroller = page.locator("[data-timeline-scroll]");
  const day2 = timelineRow(page, "10.2");

  await segment(day2, "夜游").getByRole("button", { name: /^夜游 / }).click();
  const bar = quickBar(page, "夜游");
  await expect(bar).toBeVisible();

  // 浮着的快捷条不能把横着滚的框撑高：撑高了框就能竖着滚，滚轮一推钟点那一行就滚没了，快捷条底边还会被裁掉
  const sizes = await scroller.evaluate((element) => ({ scroll: element.scrollHeight, client: element.clientHeight }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.client);
  const frame = (await scroller.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y + barBox.height).toBeLessThanOrEqual(frame.y + frame.height);

  expect(errors).toEqual([]);
});

test("电脑上：点一下复制就地多一份；块上写开销，点金额就地改", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖", "看潮"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await schedule(page, table, "看潮", "13:00", "0", "15");
  await addMoney(page, table, "西湖", "300");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");

  // 点一下「复制」：同一天同一时刻多一份，放旁边（第 2 道）
  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  await quickBar(page, "西湖").getByRole("button", { name: "复制" }).click();
  expect(await countRows(table, "西湖")).toBe(2);
  await showView(page, "时间线");
  await expect(day1.locator('[data-segment][data-lane="2"]')).toBeVisible();
  await page.keyboard.press("Control+z");
  expect(await countRows(table, "西湖")).toBe(1);

  // 块上写开销：横条上多一行，点了就地改
  await showView(page, "时间线");
  await page.getByRole("group", { name: "块上写" }).getByRole("button", { name: "开销" }).click();
  const money = segment(day1, "西湖").locator("[data-bar-money] button");
  await expect(money).toHaveText("¥300");
  // 开销那一行画在块里面，不许漏到块外面
  const moneyBox = (await money.boundingBox())!;
  const lakeBox = (await segment(day1, "西湖").boundingBox())!;
  expect(moneyBox.y + moneyBox.height).toBeLessThanOrEqual(lakeBox.y + lakeBox.height + 1);
  await shot(page, "04-money-on-blocks");
  await money.click();
  // 点了弹出完整的开销编辑区（和日程里点开销格展开的是同一套）
  const editor = page.getByRole("group", { name: "西湖 的开销" });
  await editor.getByRole("textbox", { name: "金额", exact: true }).fill("280");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(money).toHaveText("¥280");
  expect(await timeOf(table, "西湖")).toBe("09:00–12:00");

  // 15 分钟的块窄得写不下开销，就只写标题
  await showView(page, "时间线");
  await expect(segment(day1, "看潮").locator("[data-bar-money]")).toBeHidden();

  expect(errors).toEqual([]);
});

test("手机上：竖条选中后，快捷条固定在屏幕底部", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });

  await timeline.getByRole("button", { name: /^西湖 / }).click();
  const bar = quickBar(page, "西湖");
  await expect(bar).toBeVisible();
  const barBox = (await bar.boundingBox())!;
  expect(844 - (barBox.y + barBox.height)).toBeLessThan(24);
  await shot(page, "05-phone-quick-bar");

  // 手机上也是一下划掉
  await bar.getByRole("button", { name: /^标记：/ }).click();
  await expect(bar.getByRole("button", { name: /^标记：/ })).toHaveAttribute("aria-label", "标记：划掉");

  // 栏里没排时间的那一件：快捷条上没有「复制」
  await addBlocks(page, table, ["河坊街"]);
  await showView(page, "时间线");
  await timeline.getByRole("button", { name: /^河坊街 / }).click();
  const streetBar = quickBar(page, "河坊街");
  await expect(streetBar.getByRole("button", { name: "复制" })).toBeHidden();
  await expect(streetBar.getByRole("button", { name: "详情…" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("条上的一件：点一下选中，快捷条画在条下面", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["灵隐寺"]);
  await showView(page, "时间线");

  await chip(page, "灵隐寺").getByRole("button").click();
  const bar = quickBar(page, "灵隐寺");
  const barBox = await box(bar);
  const chipBox = await box(chip(page, "灵隐寺"));
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
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");

  await segment(day1, "西湖").getByRole("button", { name: /^西湖 / }).click();
  // 条上一件都没有时它不占位，按住往外拖才浮出来：先拖一点点，再量它在哪
  const copy = center(await box(quickBar(page, "西湖").getByRole("button", { name: "复制" })));
  await drag(page, copy, { x: copy.x + 40, y: copy.y }, { release: false });
  const trayPoint = center(await box(tray(page)));
  await page.mouse.move(trayPoint.x, trayPoint.y, { steps: 8 });
  await expect(tray(page)).toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();

  await expect(chip(page, "西湖").getByRole("button", { name: "西湖 10.1 上午 · 3 小时" })).toBeVisible();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  // 一步撤销：复制出来的那一件没了
  await page.keyboard.press("Control+z");
  await expect(chip(page, "西湖")).toBeHidden();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");

  expect(errors).toEqual([]);
});
