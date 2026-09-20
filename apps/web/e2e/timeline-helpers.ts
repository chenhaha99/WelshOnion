import { expect, type Locator, type Page } from "@playwright/test";

// 时间线走查共用：建计划、切换时间线和日程、在安排表里加事排时间、在时间线上量位置、用鼠标拖

export const DAY1 = /10\.1 周四 的安排/;
export const DAY2 = /10\.2 周五 的安排/;
export const DAY3 = /10\.3 周六 的安排/;

export interface Point {
  x: number;
  y: number;
}

type ViewName = "时间线" | "日程" | "总览";

interface NewPlanOptions {
  startDate?: string;
  width?: number;
  height?: number;
}

/** 新建一个计划、定好几天，停在打开时的视图（现在是时间线）。默认 10.1 出发、在 1280 × 900 的窗口里。 */
export async function newPlanKeepingView(
  page: Page,
  dayCount = 2,
  { startDate = "2026-10-01", width = 1280, height = 900 }: NewPlanOptions = {},
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill(startDate);
  await page.getByLabel("天数").fill(String(dayCount));
  await page.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("group", { name: "视图" })).toBeVisible();
}

/**
 * 新建一个计划、定好几天，再切到日程：多数走查从安排表开始。
 * 打开一个计划本来落在时间线（`newPlanKeepingView` 停在那儿），要验「打开是哪个视图」的用那一个。
 */
export async function newPlan(page: Page, dayCount = 2, options: NewPlanOptions = {}): Promise<void> {
  await newPlanKeepingView(page, dayCount, options);
  await showView(page, "日程");
  await expect(page.getByRole("list", { name: "日期列表" }).getByRole("listitem")).toHaveCount(dayCount);
}

async function pressedView(page: Page): Promise<ViewName> {
  return (await page.getByRole("group", { name: "视图" }).getByRole("button", { pressed: true }).innerText()) as ViewName;
}

/** 切到「时间线」「日程」或「总览」视图；已经是就不点。切换按钮贴着顶时，点了页面滚到新视图的开头；没贴顶不滚。 */
export async function showView(page: Page, name: ViewName): Promise<void> {
  if ((await pressedView(page)) === name) return;
  const views = page.getByRole("group", { name: "视图" });
  await views.getByRole("button", { name }).click();
  await expect(views.getByRole("button", { name, pressed: true })).toBeVisible();
}

/**
 * 在日程视图里做 action，做完切回原来的视图。读表、改表的辅助函数都这样：拖拽走查里拖一下、读一下表，测试里不用来回切。
 * 拖着没松手时不能用：一点切换按钮就松手了。
 */
async function inList<T>(page: Page, action: () => Promise<T>): Promise<T> {
  const before = await pressedView(page);
  await showView(page, "日程");
  const result = await action();
  await showView(page, before);
  return result;
}

/**
 * 切到「总览」看一眼那个同心双环，看完切回原来的视图。
 * 总览是第三个视图，别的走查大多在日程或时间线里做事，看一眼数字就回来。
 * `card` 是整张卡片，`total` 是环中间钱那行，`time` 是环中间时间那行，`note` 是环下面「还有几笔没填」那一句。
 */
export async function inOverview<T>(
  page: Page,
  action: (parts: { card: Locator; total: Locator; time: Locator; note: Locator }) => Promise<T>,
): Promise<T> {
  const before = await pressedView(page);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });
  const result = await action({
    card,
    total: card.locator("[data-ring-money]"),
    time: card.locator("[data-ring-time]"),
    note: card.locator("[data-money-note]"),
  });
  await showView(page, before);
  return result;
}

export async function addBlocks(page: Page, table: Locator, titles: string[]): Promise<void> {
  await inList(page, async () => {
    await table.getByRole("textbox", { name: "加一件事" }).click();
    for (const title of titles) {
      await page.keyboard.type(title);
      await page.keyboard.press("Enter");
    }
  });
}

/**
 * 安排表里标题是 title 的那一行。排时间会改变行的先后，所以按标题找到块 id 再定位。
 * 只切到日程、不切回：返回的行后面还要点。
 */
export async function rowOf(table: Locator, title: string): Promise<Locator> {
  await showView(table.page(), "日程");
  const id = await table
    .locator("tr[data-block-id]")
    .evaluateAll(
      (rows, wanted) =>
        rows
          .find((row) => row.querySelector<HTMLInputElement>('input[aria-label="标题"]')?.value === wanted)
          ?.getAttribute("data-block-id") ?? null,
      title,
    );
  if (id === null) throw new Error(`表里没有「${title}」`);
  return table.locator(`tr[data-block-id="${id}"]`);
}

/** 安排表里标题是 title 的有几行。 */
export async function countRows(table: Locator, title: string): Promise<number> {
  return inList(table.page(), () =>
    table
      .locator("tr[data-block-id]")
      .evaluateAll(
        (rows, wanted) =>
          rows.filter((row) => row.querySelector<HTMLInputElement>('input[aria-label="标题"]')?.value === wanted).length,
        title,
      ),
  );
}

export async function timeOf(table: Locator, title: string): Promise<string> {
  return inList(table.page(), async () => (await rowOf(table, title)).locator("[data-block-time]").innerText());
}

export async function pickKind(page: Page, table: Locator, title: string, kind: string): Promise<void> {
  await inList(page, async () => {
    await (await rowOf(table, title)).getByRole("button", { name: /^类型：/ }).click();
    // 选项旁边有「「住宿」的操作」按钮，按名字找选项要精确匹配
    await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
  });
}

export async function schedule(page: Page, table: Locator, title: string, start: string, hours: string, minutes = "0") {
  await inList(page, async () => {
    await (await rowOf(table, title)).getByRole("button", { name: "时间" }).click();
    const editor = page.getByRole("group", { name: `${title} 的时间` });
    await editor.getByLabel("开始").fill(start);
    await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
    await editor.getByRole("spinbutton", { name: "分钟" }).fill(minutes);
    await editor.getByRole("button", { name: "排上时间" }).click();
    await expect(editor).toBeHidden();
  });
}

/** 没排时间的事：放进哪一格（不给就留在整天），只存时长（不给就不填）。 */
export async function keepUndated(page: Page, table: Locator, title: string, slot?: "上午" | "下午" | "晚上", hours?: string) {
  await inList(page, async () => {
    if (slot !== undefined) {
      await (await rowOf(table, title)).getByRole("button", { name: "时间" }).click();
      const editor = page.getByRole("group", { name: `${title} 的时间` });
      // 选了格子，编辑区就收起
      await editor.getByLabel("格子").selectOption({ label: slot });
      await expect(editor).toBeHidden();
    }
    if (hours !== undefined) {
      await (await rowOf(table, title)).getByRole("button", { name: "时间" }).click();
      const editor = page.getByRole("group", { name: `${title} 的时间` });
      await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
      await editor.getByRole("spinbutton", { name: "分钟" }).fill("0");
      await editor.getByRole("button", { name: "只存时长" }).click();
      await expect(editor).toBeHidden();
    }
  });
}

/** 在 title 这块上加一笔开销：金额 yuan；给了 note 就填说明，给了 kind 就把这笔开销改成那个类型。加完收起开销的编辑区。 */
export async function addMoney(
  page: Page,
  table: Locator,
  title: string,
  yuan: string,
  { kind, note }: { kind?: string; note?: string } = {},
): Promise<void> {
  await inList(page, async () => {
    const row = await rowOf(table, title);
    await row.getByRole("button", { name: "开销" }).click();
    const editor = page.getByRole("group", { name: `${title} 的开销` });
    await editor.getByRole("textbox", { name: "新一笔的金额" }).fill(yuan);
    if (note !== undefined) await editor.getByRole("textbox", { name: "新一笔的说明" }).fill(note);
    await page.keyboard.press("Enter");
    const added = editor.locator("[data-expense-id]").last();
    await expect(added.getByRole("textbox", { name: "金额" })).toHaveValue(yuan);
    if (kind !== undefined) {
      await added.getByRole("button", { name: /^类型：/ }).click();
      await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
      await expect(added.getByRole("button", { name: `类型：${kind}` })).toBeVisible();
    }
    await row.getByRole("button", { name: "开销" }).click();
    await expect(editor).toBeHidden();
  });
}

/** 时间线上这一天的那一行。不切视图：用之前要在时间线视图里（box 会切）。 */
export function timelineRow(page: Page, day: "10.1" | "10.2" | "10.3"): Locator {
  return page.getByRole("region", { name: "时间线" }).getByRole("listitem", { name: new RegExp(day.replace(".", "\\.")) });
}

/** 时间线这一行里读屏名以「title 」开头的那段横条的外框。 */
export function segment(row: Locator, title: string): Locator {
  return row.locator("[data-segment]").filter({ has: row.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/** 打开计划设置，切到某一块（默认「基本」），返回设置窗口。 */
export async function openPlanSettings(
  page: Page,
  section: "基本" | "类型" | "标签" = "基本",
): Promise<Locator> {
  await page.getByRole("button", { name: "计划设置", exact: true }).click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  if (section !== "基本") await settings.getByRole("tab", { name: section }).click();
  return settings;
}

/** 时间线上打开一件事的详情面板：没选中就先点一下选中（点已选中的是取消选中），再点快捷条的「详情…」。 */
export async function openDetails(thing: Locator): Promise<void> {
  if ((await thing.getAttribute("aria-pressed")) !== "true") await thing.click();
  await thing.page().getByRole("button", { name: "详情…" }).click();
}

/** 选中一件事以后浮出来的快捷条。 */
export function quickBar(page: Page, title: string): Locator {
  return page.getByRole("toolbar", { name: `「${title}」的操作` });
}

/** 时间线上面那条「没排时间」（整个计划共用一条）。 */
export function tray(page: Page): Locator {
  return page.getByRole("group", { name: "没排时间" });
}

/** 条上读屏名以「title 」开头的那一件。 */
export function chip(page: Page, title: string): Locator {
  return tray(page)
    .locator("[data-undated-chip]")
    .filter({ has: page.getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/** 时间线某一行第一列的「＋ 加一件事」：点开，返回弹出来的输入框。 */
export async function openAddBlock(page: Page, row: Locator): Promise<Locator> {
  await row.getByRole("button", { name: "加一件事" }).click();
  return page.getByRole("dialog", { name: "加一件事" }).getByRole("textbox", { name: "加一件事" });
}

/**
 * 量时间线里某个元素在屏幕上的位置。先切到时间线视图，再把整张时间线滚进屏幕：
 * 量出来的点在屏幕外，鼠标按下去什么都收不到。整张卡片一次滚好，前后量的几个点才对得上。
 */
export async function box(locator: Locator) {
  await showView(locator.page(), "时间线");
  await locator.page().getByRole("region", { name: "时间线" }).scrollIntoViewIfNeeded();
  const found = await locator.boundingBox();
  if (!found) throw new Error("量不到位置");
  return found;
}

export function center(rect: { x: number; y: number; width: number; height: number }): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/**
 * 按下「0–24 点」：横轴整天按比例画、不折。拖着跨过 24 点、挪到凌晨的走查先按它：
 * 折起时块拖到凌晨，横轴会跟着伸缩，前面量好的「一小时多宽」就不对了。
 */
export async function showFullDay(page: Page): Promise<void> {
  await showView(page, "时间线");
  const button = page.getByRole("button", { name: "0–24 点" });
  // 已经按下就不点（点了会收回去）
  if ((await button.getAttribute("aria-pressed")) !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

/** 横轴两头折起的那一截多宽（像素），同 src/plan/timeline-window.ts 的 FOLD_PX */
const FOLD_PX = 24;

/** 一行横轴：在屏幕上的位置，和展开的那段从第几分钟到第几分钟（没事的凌晨和深夜折在两头）。 */
export interface AxisGeometry {
  rect: { x: number; y: number; width: number; height: number };
  from: number;
  to: number;
}

export async function axisOf(row: Locator): Promise<AxisGeometry> {
  const axis = row.locator("[data-timeline-axis]");
  const rect = await box(axis);
  const [from, to] = await Promise.all([axis.getAttribute("data-window-from"), axis.getAttribute("data-window-to")]);
  return { rect, from: Number(from), to: Number(to) };
}

function foldWidths(axis: AxisGeometry): { before: number; after: number } {
  return { before: axis.from > 0 ? FOLD_PX : 0, after: axis.to < 1440 ? FOLD_PX : 0 };
}

/** 这一行第几分钟离横轴左边多少像素（0–1440 以内）：两头折起的那一截各 24 像素，展开的那段按比例。同 timeline-window 的 axisPixel。 */
export function axisX(axis: AxisGeometry, minute: number): number {
  const { before, after } = foldWidths(axis);
  const { width } = axis.rect;
  if (minute < axis.from) return (before * minute) / axis.from;
  if (minute > axis.to) return width - after + (after * (minute - axis.to)) / (1440 - axis.to);
  return before + ((width - before - after) * (minute - axis.from)) / (axis.to - axis.from);
}

/** 反过来：离横轴左边 x 像素（横轴以内）是第几分钟。 */
export function minuteAtX(axis: AxisGeometry, x: number): number {
  const { before, after } = foldWidths(axis);
  const { width } = axis.rect;
  if (x < before) return (x / before) * axis.from;
  if (x > width - after) return axis.to + ((x - (width - after)) / after) * (1440 - axis.to);
  return axis.from + ((x - before) / (width - before - after)) * (axis.to - axis.from);
}

/** 这一行的横轴上，展开的那段里 1 小时有多少像素。 */
export async function hourWidth(row: Locator): Promise<number> {
  const axis = await axisOf(row);
  const { before, after } = foldWidths(axis);
  return (axis.rect.width - before - after) / ((axis.to - axis.from) / 60);
}

/** 这一行横轴上某个时刻（分钟）、横轴竖着的正中间，在屏幕上的位置。 */
export async function axisPoint(row: Locator, minute: number): Promise<Point> {
  const axis = await axisOf(row);
  return { x: axis.rect.x + axisX(axis, minute), y: axis.rect.y + axis.rect.height / 2 };
}

/** 用鼠标从 from 拖到 to（分几步移动，会越过 4 像素的门槛）；release 为 false 时停在终点不松手。 */
export async function drag(page: Page, from: Point, to: Point, options: { alt?: boolean; release?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (options.alt) await page.keyboard.down("Alt");
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (options.release === false) return;
  await page.mouse.up();
  if (options.alt) await page.keyboard.up("Alt");
}
