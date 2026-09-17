/**
 * 钱的统计和进度。只呈现事实：不内置「应该占多少」，不判断超没超预算。
 */
import type { ExpenseView, PlanView } from "../read";
import { expensePasses, filteredBlocks, type StatsFilter } from "./filter";

export interface MoneySummary {
  totalCents: number;
  /** 总额 ÷ 人数，四舍五入到整数分 */
  perPersonCents: number;
  /** 按钱自己的类型；总数是 0 的类别不出现 */
  byKind: ReadonlyMap<string, number>;
  /** 整笔归挂的块里最早那天；没有钱的日子不出现 */
  byDay: ReadonlyMap<string, number>;
  /** 一个块都不挂的钱（签证、保险），不摊进任何一天 */
  unattributedCents: number;
}

export interface FillProgress {
  /** 含没填金额的钱 */
  expenseCount: number;
  filledCount: number;
  /** 一笔钱都没挂的块（挂了没填金额的钱也算挂了） */
  blocksWithoutMoney: number;
  unfilledByKind: ReadonlyMap<string, number>;
}

/** 一笔钱计入统计的金额：per_person 乘人数；没填金额返回 null。 */
export function expenseTotalCents(expense: ExpenseView, travelerCount: number): number | null {
  if (expense.amount_cents === null) return null;
  return expense.basis === "per_person" ? expense.amount_cents * travelerCount : expense.amount_cents;
}

export function moneySummary(plan: PlanView, filter?: StatsFilter): MoneySummary {
  const dayOrder = new Map(plan.bases.map((base, index) => [base.id, index]));
  const byKind = new Map<string, number>();
  const byDay = new Map<string, number>();
  let totalCents = 0;
  let unattributedCents = 0;

  for (const expense of plan.expenses.values()) {
    if (!expensePasses(expense, plan, filter)) continue;
    const cents = expenseTotalCents(expense, plan.plan.traveler_count);
    if (cents === null) continue;
    totalCents += cents;
    addTo(byKind, expense.kind.id, cents);
    const day = earliestDay(expense, plan, dayOrder);
    if (day === null) {
      unattributedCents += cents;
    } else {
      addTo(byDay, day, cents);
    }
  }

  return {
    totalCents,
    perPersonCents: Math.round(totalCents / plan.plan.traveler_count),
    byKind: withoutZeros(byKind),
    byDay: withoutZeros(byDay),
    unattributedCents,
  };
}

export function fillProgress(plan: PlanView, filter?: StatsFilter): FillProgress {
  let expenseCount = 0;
  let filledCount = 0;
  const unfilledByKind = new Map<string, number>();
  const blocksWithMoney = new Set<string>();

  for (const expense of plan.expenses.values()) {
    if (!expensePasses(expense, plan, filter)) continue;
    expenseCount++;
    if (expense.amount_cents === null) {
      addTo(unfilledByKind, expense.kind.id, 1);
    } else {
      filledCount++;
    }
    for (const blockId of expense.block_ids) blocksWithMoney.add(blockId);
  }

  const blocksWithoutMoney = filteredBlocks(plan, filter).filter((block) => !blocksWithMoney.has(block.id)).length;
  return { expenseCount, filledCount, blocksWithoutMoney, unfilledByKind };
}

function earliestDay(expense: ExpenseView, plan: PlanView, dayOrder: ReadonlyMap<string, number>): string | null {
  let earliest: { baseId: string; order: number } | null = null;
  for (const blockId of expense.block_ids) {
    const baseId = plan.blocks.get(blockId)?.start_base_id;
    const order = baseId === undefined ? undefined : dayOrder.get(baseId);
    if (baseId !== undefined && order !== undefined && (earliest === null || order < earliest.order)) {
      earliest = { baseId, order };
    }
  }
  return earliest?.baseId ?? null;
}

function addTo(map: Map<string, number>, key: string, amount: number): void {
  map.set(key, (map.get(key) ?? 0) + amount);
}

function withoutZeros(map: Map<string, number>): Map<string, number> {
  for (const [key, value] of map) {
    if (value === 0) map.delete(key);
  }
  return map;
}
