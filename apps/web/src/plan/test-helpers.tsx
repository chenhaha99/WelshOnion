import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { setDays } from "@welshonion/core";
import type * as Y from "yjs";
import { NOW, renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan } from "../storage/plans";

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
