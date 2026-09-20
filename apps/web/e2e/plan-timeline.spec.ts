import { expect, test, type Locator, type Page } from "@playwright/test";
import { axisOf, minuteAtX, openDetails, quickBar, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

async function pickKind(page: Page, row: Locator, kind: string): Promise<void> {
  await row.getByRole("button", { name: /^类型：/ }).click();
  // 选项旁边有「「住宿」的操作」按钮，按名字找选项要精确匹配
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
}

async function schedule(page: Page, row: Locator, title: string, start: string, hours: string): Promise<void> {
  await row.getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: `${title} 的时间` });
  await editor.getByLabel("开始").fill(start);
  await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
  await editor.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await editor.getByRole("button", { name: "排上时间" }).click();
  await expect(editor).toBeHidden();
}

/** 时间线这一行里读屏名以「title 」开头的那段横条的外框。 */
function segment(row: Locator, title: string): Locator {
  return row.locator("[data-segment]").filter({ has: row.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/** 按屏幕上量到的位置，换算这段横条从这一行的第几分钟画到第几分钟（两头折起的钟点按压缩的比例换算）。 */
async function measuredMinutes(row: Locator, title: string): Promise<{ from: number; to: number }> {
  const axis = await axisOf(row);
  const box = await segment(row, title).boundingBox();
  return { from: minuteAtX(axis, box!.x - axis.rect.x), to: minuteAtX(axis, box!.x + box!.width - axis.rect.x) };
}

test("时间线：排出一天 → 按时长画 → 点开详情面板 → 电脑和手机上的宽度", async ({ page }) => {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");

  const timeline = page.getByRole("region", { name: "时间线" });
  // 刚建好、一件事都没有：时间线上提示去加第一件事
  const hint = timeline.getByText("还没有事。加了事、排上时间，就会画在这里");
  await showView(page, "时间线");
  await expect(hint).toBeVisible();

  // 在日程里用表格排出一天：排时间不改变这几行的先后
  await showView(page, "日程");
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["在杭州", "西湖", "游船", "民宿"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(4);
  await pickKind(page, rows.nth(0), "停留");
  await schedule(page, rows.nth(0), "在杭州", "00:00", "48");
  await schedule(page, rows.nth(1), "西湖", "09:00", "3");
  await schedule(page, rows.nth(2), "游船", "10:00", "1");
  await pickKind(page, rows.nth(3), "住宿");
  await schedule(page, rows.nth(3), "民宿", "22:00", "10");
  await showView(page, "时间线");
  await expect(timeline.locator("[data-segment]").first()).toBeVisible();
  await expect(hint).toHaveCount(0);

  // 位置对得上时间（误差不到 5 分钟）
  const day1 = timeline.getByRole("listitem", { name: /10\.1/ });
  const day2 = timeline.getByRole("listitem", { name: /10\.2/ });
  const lake = await measuredMinutes(day1, "西湖");
  expect(lake.from).toBeCloseTo(540, -1);
  expect(lake.to).toBeCloseTo(720, -1);
  const innNight = await measuredMinutes(day1, "民宿");
  expect(innNight.from).toBeCloseTo(1320, -1);
  expect(innNight.to).toBeCloseTo(1440, -1);
  const innMorning = await measuredMinutes(day2, "民宿");
  expect(innMorning.from).toBeCloseTo(0, -1);
  expect(innMorning.to).toBeCloseTo(480, -1);

  // 游船和西湖重叠，画在下面一道；停留、住宿在上方的背景条里
  const lakeBox = (await segment(day1, "西湖").boundingBox())!;
  const boatBox = (await segment(day1, "游船").boundingBox())!;
  expect(boatBox.y).toBeGreaterThanOrEqual(lakeBox.y + lakeBox.height);
  await expect(segment(day1, "在杭州")).toHaveAttribute("data-track", "background");
  await expect(segment(day1, "民宿")).toHaveAttribute("data-track", "background");
  expect((await segment(day1, "在杭州").boundingBox())!.y).toBeLessThan(lakeBox.y);
  await timeline.scrollIntoViewIfNeeded();
  await shot(page, "01-timeline");

  // 点第二天那段：快捷条上有类型、开销，没有状态；「详情…」弹出的是贴着按钮的气泡（只有标题、备注这些）
  const second = segment(day2, "民宿").getByRole("button", { name: /^民宿 / });
  await second.click();
  const bar = page.getByRole("toolbar", { name: "「民宿」的操作" });
  await expect(bar.getByRole("button", { name: "类型：住宿" })).toBeVisible();
  await expect(bar.getByRole("button", { name: /^状态/ })).toHaveCount(0);
  await expect(second).toHaveAttribute("title", "民宿 22:00–10.2 08:00");
  await bar.getByRole("button", { name: "详情…" }).click();
  const panel = page.getByRole("dialog", { name: "民宿" });
  await expect(panel.getByLabel("标题")).toHaveValue("民宿");
  await expect(panel.getByRole("button", { name: "时间" })).toHaveCount(0);
  const panelBox = (await panel.boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  // 贴着「详情…」那个按钮弹出，不是占满右边的抽屉
  expect(Math.abs(panelBox.x - barBox.x)).toBeLessThan(200);
  expect(panelBox.x + panelBox.width).toBeLessThan(1280);
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name: "时间线", pressed: true })).toBeVisible();
  await shot(page, "02-details");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // 只用键盘：回车打开详情，Esc 关掉，焦点回到横条
  await showView(page, "时间线");
  const lakeBar = segment(day1, "西湖").getByRole("button");
  await lakeBar.focus();
  // 回车选中 → Tab 进快捷条（第一个是「划掉」）→ 再 Tab 到「详情…」→ 回车开详情 → Esc 关详情、再 Esc 取消选中
  await page.keyboard.press("Enter");
  await expect(quickBar(page, "西湖")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(quickBar(page, "西湖").getByRole("button", { name: /^标记：/ })).toBeFocused();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "西湖" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "西湖" })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "西湖")).toBeHidden();
  await expect(lakeBar).toBeFocused();

  // 电脑上不用横着滚，每小时至少 30 像素
  const scroller = timeline.locator("[data-timeline-scroll]");
  const axisWidth = async () => (await day1.locator("[data-timeline-axis]").boundingBox())!.width;
  expect(await scroller.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect((await axisWidth()) / 24).toBeGreaterThanOrEqual(30);

  // 窄一点的电脑窗口：还是横着铺，在卡片里横着滚，页面本身不横着滚
  await page.setViewportSize({ width: 900, height: 800 });
  await expect.poll(() => scroller.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true);
  expect((await axisWidth()) / 24).toBeGreaterThanOrEqual(30);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(900);

  // 手机上换成竖排的一天，页面本身不横着滚
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(timeline.locator("[data-day-scroll]")).toBeVisible();
  await expect(scroller).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await timeline.scrollIntoViewIfNeeded();
  await shot(page, "03-mobile");

  expect(errors).toEqual([]);
});
