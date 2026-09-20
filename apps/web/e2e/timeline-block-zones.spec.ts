import { expect, test, type Locator, type Page } from "@playwright/test";
import { addBlocks, addMoney, DAY1, newPlan, quickBar, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机竖排打开是第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");
const LONG_TITLE = "西湖边走一整圈再去断桥看荷花然后坐船去三潭印月";

async function box(locator: Locator) {
  return (await locator.boundingBox())!;
}

/** 「块上写」里这个开关没按下就按下。 */
async function turnOn(page: Page, label: "标题" | "时长" | "开销"): Promise<void> {
  const button = page.getByRole("group", { name: "块上写" }).getByRole("button", { name: label, exact: true });
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
}

/** 选中这件事，在快捷条的「标签」里新建一个标签挂上，再收起面板、取消选中。 */
async function tagWithNew(page: Page, block: Locator, title: string, name: string): Promise<void> {
  await block.click();
  await quickBar(page, title).getByRole("button", { name: /^标签：/ }).click();
  const picker = page.getByRole("dialog", { name: "选择标签" });
  await picker.getByRole("button", { name: "+ 新建标签" }).click();
  await picker.getByRole("textbox", { name: "名字" }).fill(name);
  await picker.getByRole("button", { name: "确定", exact: true }).click();
  await expect(picker.getByRole("button", { name, exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
}

test("电脑上：挂标签、开时长和开销、拉到 3 行 → 书签在上面靠右，标题在中间写 3 行，时长和开销在最下面靠右；窄块时长整个不写", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, [LONG_TITLE, "灵隐寺", "喝茶"]);
  await schedule(page, table, LONG_TITLE, "09:00", "2");
  await schedule(page, table, "灵隐寺", "14:00", "2");
  await schedule(page, table, "喝茶", "17:00", "0", "45");
  await addMoney(page, table, LONG_TITLE, "300");
  await addMoney(page, table, "喝茶", "20");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const lakeSegment = segment(day1, LONG_TITLE);
  const lake = lakeSegment.getByRole("button", { name: new RegExp(`^${LONG_TITLE} `) });
  const temple = segment(day1, "灵隐寺");

  await tagWithNew(page, lake, LONG_TITLE, "必去");
  await turnOn(page, "时长");
  await turnOn(page, "开销");

  // 行数拉动条在「横向放大」右边：键盘拉到 3 行
  const lines = page.getByRole("slider", { name: "文字行数" });
  await lines.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(page.getByText("3 行", { exact: true })).toBeVisible();
  const zoomBox = await box(page.getByRole("slider", { name: "横向放大" }));
  expect((await box(lines)).x).toBeGreaterThan(zoomBox.x);

  // 块高：书签栏 12 + 标题 3 行 48 + 附件栏 16 + 上下边框 2
  await expect.poll(async () => Math.round((await box(lakeSegment)).height)).toBe(78);
  const bar = await box(lake);
  // 上：书签从块的上边挂下来，靠右
  const ribbons = await box(lake.locator("[data-block-tags]"));
  expect(ribbons.y - bar.y).toBeLessThanOrEqual(1.5);
  expect(bar.x + bar.width - (ribbons.x + ribbons.width)).toBeGreaterThanOrEqual(2);
  expect(bar.x + bar.width - (ribbons.x + ribbons.width)).toBeLessThanOrEqual(6);
  // 中：标题在书签下面，长标题写满 3 行
  const title = await box(lake.locator("[data-bar-title]"));
  expect(title.y).toBeGreaterThanOrEqual(ribbons.y + ribbons.height - 0.5);
  expect(Math.round(title.height)).toBe(48);
  // 下：时长在开销左边，开销在最右，都在块的最下面，和标题不叠
  const duration = await box(lakeSegment.locator("[data-bar-duration]"));
  const money = await box(lakeSegment.locator("[data-bar-money]"));
  expect(duration.x + duration.width).toBeLessThanOrEqual(money.x + 0.5);
  expect(bar.x + bar.width - (money.x + money.width)).toBeLessThanOrEqual(6);
  expect(bar.y + bar.height - (money.y + money.height)).toBeLessThanOrEqual(2);
  expect(duration.y).toBeGreaterThanOrEqual(title.y + title.height - 0.5);
  // 没挂标签的「灵隐寺」也留着书签栏：两件的标题对得齐
  const templeTitle = await box(temple.locator("[data-bar-title]"));
  expect(Math.abs(templeTitle.y - title.y)).toBeLessThan(1);
  await shot(page, "01-three-zones");

  // 45 分钟的「喝茶」挂着 20 元：放不下时长和开销两样时，时长整个不写（不留半截），开销照写
  const tea = segment(day1, "喝茶");
  await expect(tea.locator("[data-bar-money]")).toBeVisible();
  const teaFoot = await box(tea.locator("[data-bar-foot]"));
  const teaDuration = await box(tea.locator("[data-bar-duration]"));
  expect(teaDuration.y, "放不下的时长换到看不见的下一行").toBeGreaterThanOrEqual(teaFoot.y + teaFoot.height - 0.5);

  // 拉回 1 行：标题只写一行、截断
  await lines.focus();
  await page.keyboard.press("Home");
  await expect.poll(async () => Math.round((await box(lake.locator("[data-bar-title]"))).height)).toBe(16);
  await expect.poll(async () => Math.round((await box(lakeSegment)).height)).toBe(46);

  // 关掉「标题」：拉动条按不了
  await page.getByRole("group", { name: "块上写" }).getByRole("button", { name: "标题", exact: true }).click();
  await expect(lines).toBeDisabled();

  expect(errors).toEqual([]);
});

test("手机上：竖条也分三区，书签在右上、时长和开销在最下面靠右；没有文字行数拉动条", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await schedule(page, table, "西湖", "09:00", "3");
  await addMoney(page, table, "西湖", "300");
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const lake = timeline.getByRole("button", { name: /^西湖 / });

  await tagWithNew(page, lake, "西湖", "必去");
  await turnOn(page, "时长");
  await turnOn(page, "开销");
  await expect(page.getByRole("slider", { name: "文字行数" })).toHaveCount(0);

  const bar = await box(lake);
  const ribbons = await box(lake.locator("[data-block-tags]"));
  expect(ribbons.y - bar.y).toBeLessThanOrEqual(1.5);
  expect(bar.x + bar.width - (ribbons.x + ribbons.width)).toBeLessThanOrEqual(6);
  const title = await box(lake.locator("[data-bar-title]"));
  expect(title.y).toBeGreaterThanOrEqual(ribbons.y + ribbons.height - 0.5);
  const foot = await box(lake.locator("[data-bar-foot]"));
  expect(bar.y + bar.height - (foot.y + foot.height)).toBeLessThanOrEqual(2);
  const duration = await box(lake.locator("[data-bar-duration]"));
  const money = await box(lake.locator("[data-bar-money-text]"));
  await expect(lake.locator("[data-bar-money-text]")).toHaveText("¥300");
  expect(duration.x + duration.width).toBeLessThanOrEqual(money.x + 0.5);
  expect(bar.x + bar.width - (money.x + money.width)).toBeLessThanOrEqual(6);
  await shot(page, "02-phone-three-zones");

  // 划掉：附件栏单独摆在竖条最下面，划线也要有
  await lake.click();
  await quickBar(page, "西湖").getByRole("button", { name: /^标记：/ }).click();
  await expect
    .poll(() => lake.locator("[data-bar-foot]").evaluate((node) => getComputedStyle(node).textDecorationLine))
    .toBe("line-through");

  expect(errors).toEqual([]);
});
