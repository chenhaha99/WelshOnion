import type { DayBudget } from "@welshonion/core";
import { durationLabel } from "./block-time";

export type BudgetField = keyof DayBudget;

/** 解析一栏：ok 时 value 是 null 表示空着（不设这一项）。 */
export type Parsed<T> = { ok: true; value: T | null } | { ok: false };

/** 「8:00」「08:00」→「08:00」，只认 00:00 到 23:59。 */
export function parseClockText(text: string): Parsed<string> {
  if (text === "") return { ok: true, value: null };
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (!match) return { ok: false };
  const hours = Number(match[1]);
  if (hours > 23 || Number(match[2]) > 59) return { ok: false };
  return { ok: true, value: `${String(hours).padStart(2, "0")}:${match[2]}` };
}

/** 按小时填，最多两位小数，存成分钟：「4.5」→ 270。 */
export function parseHours(text: string): Parsed<number> {
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false };
  return { ok: true, value: Math.round(Number(text) * 60) };
}

/** 分钟换回小时，最多两位小数：270 →「4.5」。 */
export function hoursText(minutes: number): string {
  return String(Math.round((minutes / 60) * 100) / 100);
}

/** 不小于 0 的整数公里。 */
export function parseKm(text: string): Parsed<number> {
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  return { ok: true, value: Number(text) };
}

/** 改预算里的一项，null 就去掉这一项；四项都没了返回 null（不存预算）。 */
export function withBudgetField<F extends BudgetField>(
  budget: DayBudget | null,
  field: F,
  value: NonNullable<DayBudget[F]> | null,
): DayBudget | null {
  const next: DayBudget = { ...budget };
  if (value === null) delete next[field];
  else next[field] = value;
  return Object.keys(next).length > 0 ? next : null;
}

/** 「你设的」那一行的各项：「08:00 起」「22:00 收工」「最多开 4.5 小时」「最多开 300 公里」，没设的不写。 */
export function budgetParts(budget: DayBudget): string[] {
  const parts: string[] = [];
  if (budget.start !== undefined) parts.push(`${budget.start} 起`);
  if (budget.end !== undefined) parts.push(`${budget.end} 收工`);
  if (budget.max_drive_min !== undefined) parts.push(`最多开 ${durationLabel(budget.max_drive_min)}`);
  if (budget.max_drive_km !== undefined) parts.push(`最多开 ${budget.max_drive_km} 公里`);
  return parts;
}

/** 栏里显示的字：没设是空的，开多久按小时写。 */
export function budgetFieldText(budget: DayBudget | null, field: BudgetField): string {
  const value = budget?.[field];
  if (value === undefined) return "";
  return field === "max_drive_min" ? hoursText(Number(value)) : String(value);
}
