import { expect, type Locator, type Page } from "@playwright/test";

// 时间轴走查共用：建计划、在安排表里加事排时间、在时间轴上量位置、用鼠标拖

export const DAY1 = /10\.1 周四 的安排/;
export const DAY2 = /10\.2 周五 的安排/;
export const DAY3 = /10\.3 周六 的安排/;

export interface Point {
  x: number;
  y: number;
}

export async function newPlan(page: Page, dayCount = 2): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill(String(dayCount));
  await page.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("list", { name: "日期列表" }).getByRole("listitem")).toHaveCount(dayCount);
}

export async function addBlocks(page: Page, table: Locator, titles: string[]): Promise<void> {
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
}

/** 安排表里标题是 title 的那一行。排时间会改变行的先后，所以按标题找到块 id 再定位。 */
export async function rowOf(table: Locator, title: string): Promise<Locator> {
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
  return table
    .locator("tr[data-block-id]")
    .evaluateAll(
      (rows, wanted) =>
        rows.filter((row) => row.querySelector<HTMLInputElement>('input[aria-label="标题"]')?.value === wanted).length,
      title,
    );
}

export async function timeOf(table: Locator, title: string): Promise<string> {
  return (await rowOf(table, title)).locator("[data-block-time]").innerText();
}

export async function pickKind(page: Page, table: Locator, title: string, kind: string): Promise<void> {
  await (await rowOf(table, title)).getByRole("button", { name: /^类型：/ }).click();
  // 选项旁边有「「住宿」的操作」按钮，按名字找选项要精确匹配
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
}

export async function schedule(page: Page, table: Locator, title: string, start: string, hours: string, minutes = "0") {
  await (await rowOf(table, title)).getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: `${title} 的时间` });
  await editor.getByLabel("开始").fill(start);
  await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
  await editor.getByRole("spinbutton", { name: "分钟" }).fill(minutes);
  await editor.getByRole("button", { name: "排上时间" }).click();
  await expect(editor).toBeHidden();
}

/** 没排时间的事：放进哪一格（不给就留在整天），只存时长（不给就不填）。 */
export async function keepUndated(page: Page, table: Locator, title: string, slot?: "上午" | "下午" | "晚上", hours?: string) {
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
}

export function timelineRow(page: Page, day: "10.1" | "10.2" | "10.3"): Locator {
  return page.getByRole("region", { name: "时间轴" }).getByRole("listitem", { name: new RegExp(day.replace(".", "\\.")) });
}

/** 时间轴这一行里读屏名以「title 」开头的那段横条的外框。 */
export function segment(row: Locator, title: string): Locator {
  return row.locator("[data-segment]").filter({ has: row.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/** 时间轴这一行右边的「没排时间」栏。 */
export function trayOf(row: Locator): Locator {
  return row.getByRole("group", { name: "没排时间" });
}

/** 「没排时间」栏里读屏名以「title 」开头的那一件。 */
export function chip(row: Locator, title: string): Locator {
  return trayOf(row)
    .locator("[data-undated-chip]")
    .filter({ has: row.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/**
 * 量时间轴里某个元素在屏幕上的位置。先把整张时间轴滚进屏幕：在下面的安排表里点过以后页面会往下滚，
 * 时间轴跑到屏幕上面，量出来的点在屏幕外，鼠标按下去什么都收不到。整张卡片一次滚好，前后量的几个点才对得上。
 */
export async function box(locator: Locator) {
  await locator.page().getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  const found = await locator.boundingBox();
  if (!found) throw new Error("量不到位置");
  return found;
}

export function center(rect: { x: number; y: number; width: number; height: number }): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** 这一行的横轴上，1 小时有多少像素。 */
export async function hourWidth(row: Locator): Promise<number> {
  return (await box(row.locator("[data-timeline-axis]"))).width / 24;
}

/** 这一行横轴上某个时刻（分钟）、横轴竖着的正中间，在屏幕上的位置。 */
export async function axisPoint(row: Locator, minute: number): Promise<Point> {
  const axis = await box(row.locator("[data-timeline-axis]"));
  return { x: axis.x + (minute / 1440) * axis.width, y: axis.y + axis.height / 2 };
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
