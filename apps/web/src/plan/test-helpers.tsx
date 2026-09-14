import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { readLibrary, readPlan, setDays, type LibraryView, type PlanView } from "@welshonion/core";
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

export async function dayLabels(): Promise<string[]> {
  const list = await screen.findByRole("list", { name: "日期列表" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("[data-day-label]")?.textContent ?? "");
}

/** 标签里含 text 的那一行（比如「10.2」）。 */
export async function dayRow(text: string): Promise<HTMLElement> {
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

/** 下拉当前选中项的文字。 */
export function selectedText(select: HTMLElement): string {
  return (select as HTMLSelectElement).selectedOptions[0]?.textContent ?? "";
}
