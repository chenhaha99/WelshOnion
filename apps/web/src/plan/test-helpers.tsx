import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { readLibrary, readPlan, setDays, type LibraryView, type PlanView } from "@welshonion/core";
import { vi } from "vitest";
import type * as Y from "yjs";
import { NOW, renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan, openPlan } from "../storage/plans";
import { track } from "../storage/test-helpers";

/** 在本机存一个计划（可以先往里写点东西），然后在计划页打开它。返回计划 id。 */
export async function openStoredPlan(setup?: (plan: Y.Doc, library: Y.Doc) => void): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name: "测试计划", now: NOW });
  setup?.(plan.doc, library.doc);
  await plan.close();
  await library.close();
  renderApp(`#/plans/${plan.planId}`);
  return plan.planId;
}

/**
 * 像另一个标签页那样打开这个计划。只开一次，之后每次读的都是它手上最新的内容
 * （打开时本机存着的 + 之后标签页之间同步过来的）。在 waitFor 里反复读它，不要反复打开。
 */
export async function openOtherTab(planId: string): Promise<{ plan: () => PlanView; library: () => LibraryView }> {
  const libraryHandle = track(await openLibrary());
  const planHandle = track(await openPlan(libraryHandle.doc, planId, NOW));
  return {
    plan: () => readPlan(planHandle.doc, readLibrary(libraryHandle.doc)),
    library: () => readLibrary(libraryHandle.doc),
  };
}

/** 像另一个标签页那样只打开资料库，用法同 openOtherTab。 */
export async function openOtherLibrary(): Promise<() => LibraryView> {
  const libraryHandle = track(await openLibrary());
  return () => readLibrary(libraryHandle.doc);
}

/** 从 10.1 起、北京时区的连续几天，返回底座 id。 */
export function daysFromOct1(doc: Y.Doc, count: number): string[] {
  const result = setDays(doc, { startDate: "2026-10-01", count, tz: "Asia/Shanghai" });
  if (!result.ok) throw new Error("建天失败");
  return result.value.baseIds;
}

/** 模拟窗口宽 390 像素：只要问「至少 720 像素宽吗」都答不是。在 beforeEach 里调，afterEach 里 vi.unstubAllGlobals()。 */
export function stubNarrowScreen(): void {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: !query.includes("min-width: 720px"),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

/** 切到「时间轴」「列表」或「总览」视图；已经是就不动。 */
export async function showView(name: "时间轴" | "列表" | "总览"): Promise<void> {
  // 找日期列表的辅助函数每次都先调它，用 CSS 选择器找，比按读屏名找快
  const button = await waitFor(() => {
    const found = [...document.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="视图"] button')].find(
      (item) => item.textContent === name,
    );
    if (!found) throw new Error("计划页上还没有「视图」切换按钮");
    return found;
  });
  if (button.getAttribute("aria-pressed") !== "true") fireEvent.click(button);
}

/** 「视图」里按下的是哪个：「时间轴」或「列表」。 */
export function pressedView(): string | null {
  return document.querySelector('[role="group"][aria-label="视图"] button[aria-pressed="true"]')?.textContent ?? null;
}

/** 每天的标签。先切到列表。 */
export async function dayLabels(): Promise<string[]> {
  await showView("列表");
  const list = await screen.findByRole("list", { name: "日期列表" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("[data-day-label]")?.textContent ?? "");
}

/** 标签里含 text 的那一行（比如「10.2」）。先切到列表：要断言「切到了列表」的，在调它之前看 pressedView。 */
export async function dayRow(text: string): Promise<HTMLElement> {
  await showView("列表");
  const list = await screen.findByRole("list", { name: "日期列表" });
  const row = within(list)
    .getAllByRole("listitem")
    .find((item) => item.querySelector("[data-day-label]")?.textContent?.includes(text));
  if (!row) throw new Error(`没有含「${text}」的那一天`);
  return row;
}

export async function openDayMenu(user: UserEvent, text: string): Promise<HTMLElement> {
  await user.click(within(await dayRow(text)).getByRole("button", { name: "这天的操作" }));
  return screen.getByRole("menu");
}

/** 「总览」视图里的开销总览卡片；会先切到「总览」。 */
export async function moneyOverview(): Promise<HTMLElement> {
  await showView("总览");
  return screen.findByRole("region", { name: "开销总览" });
}

/** 打开计划设置，切到某一块（默认「基本」），返回设置窗口。 */
export async function openPlanSettings(
  user: UserEvent,
  section: "基本" | "类型和状态" | "时间预算" = "基本",
): Promise<HTMLElement> {
  await user.click(await screen.findByRole("button", { name: "计划设置" }));
  const settings = await screen.findByRole("dialog", { name: "计划设置" });
  if (section !== "基本") await user.click(within(settings).getByRole("tab", { name: section }));
  return settings;
}

/** 时间轴上打开一件事的详情面板：点一下选中它，再点快捷条的「详情…」。 */
/** 时间轴上面那条「没排时间」（一件都没有时它不在，返回 null）。 */
export function undatedStrip(): HTMLElement | null {
  return screen.queryByRole("group", { name: "没排时间" });
}

/** 时间轴上点开某一天的「加一件事」，返回弹出来的输入框。 */
export async function openAddBlock(user: UserEvent, row: HTMLElement): Promise<HTMLElement> {
  await user.click(within(row).getByRole("button", { name: "加一件事" }));
  return within(screen.getByRole("dialog", { name: "加一件事" })).getByRole("textbox", { name: "加一件事" });
}

export async function openDetails(user: UserEvent, thing: HTMLElement): Promise<void> {
  await user.click(thing);
  await user.click(screen.getByRole("button", { name: "详情…" }));
}

/** 某一天安排表里的块行，按显示顺序。 */
export async function blockRows(day: string): Promise<HTMLElement[]> {
  return [...(await dayRow(day)).querySelectorAll<HTMLElement>("tr[data-block-id]")];
}

export async function blockTexts(day: string): Promise<Array<{ title: string; time: string }>> {
  return (await blockRows(day)).map((row) => ({
    title: row.querySelector<HTMLInputElement>("input[aria-label='标题']")?.value ?? "",
    time: row.querySelector("[data-block-time]")?.textContent ?? "",
  }));
}

export async function blockTitles(day: string): Promise<string[]> {
  return (await blockTexts(day)).map((block) => block.title);
}

/** 某一天里标题是 title 的那一行。 */
export async function blockRow(day: string, title: string): Promise<HTMLElement> {
  const row = (await blockRows(day)).find(
    (item) => item.querySelector<HTMLInputElement>("input[aria-label='标题']")?.value === title,
  );
  if (!row) throw new Error(`${day} 里没有「${title}」`);
  return row;
}

/**
 * 下拉当前选中项的文字。按 selectedIndex 找：测试用的 happy-dom 里，选了一项、React 又按新的值重新选中以后，
 * selectedOptions 还停在旧的那项，selectedIndex 和每项的 selected 是对的。
 */
export function selectedText(select: HTMLElement): string {
  const element = select as HTMLSelectElement;
  return element.options[element.selectedIndex]?.textContent ?? "";
}
