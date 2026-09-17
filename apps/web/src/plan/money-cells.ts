import { expensePasses, expenseTotalCents, passesFilter, type PlanView, type StatsFilter } from "@welshonion/core";
import { blocksOfDay } from "./day-blocks";
import { formatYuan } from "./money";

export interface MoneyCell {
  /** 以这块为显示块的开销里，填了金额的合计（分，人均的已按人数乘过） */
  ownCents: number;
  /** 以这块为显示块的开销有几笔（含没填金额的） */
  ownCount: number;
  /** 其中没填金额的笔数 */
  unfilledCount: number;
  /** 这块还挂着显示块在别处的共用开销 */
  sharedElsewhere: boolean;
  /** 按类型筛时，这块还挂着类型被筛掉的开销 */
  otherKinds: boolean;
}

/**
 * 每个挂了开销的块的开销格摘要。一笔开销挂多个块时，「显示块」是表里最早的那块
 * （先按天的顺序、再按这天安排表的顺序），只算进它；其他块记成「共用」。不挂块的开销不进开销格。
 * 带筛选时只算通过筛选的开销，显示块和「共用」都只在通过筛选的块里挑（被筛掉的块不显示）。
 * 按类型筛时，显示的块上挂着类型被筛掉的开销，记 otherKinds；只挂着这种开销的块，开销格是空的（见 moneyCellEmpty）。
 */
export function moneyCells(plan: PlanView, filter?: StatsFilter): Map<string, MoneyCell> {
  const tableOrder = new Map<string, number>();
  for (const base of plan.bases) {
    for (const block of blocksOfDay(plan, base.id)) {
      if (passesFilter(block, filter)) tableOrder.set(block.id, tableOrder.size);
    }
  }

  const cells = new Map<string, MoneyCell>();
  const cellOf = (blockId: string): MoneyCell => {
    let cell = cells.get(blockId);
    if (!cell) {
      cell = { ownCents: 0, ownCount: 0, unfilledCount: 0, sharedElsewhere: false, otherKinds: false };
      cells.set(blockId, cell);
    }
    return cell;
  };

  for (const expense of plan.expenses.values()) {
    if (!expensePasses(expense, plan, filter)) {
      if (filter?.kindIds && !filter.kindIds.includes(expense.kind.id)) {
        for (const blockId of expense.block_ids) {
          if (tableOrder.has(blockId)) cellOf(blockId).otherKinds = true;
        }
      }
      continue;
    }
    const [displayBlock, ...others] = expense.block_ids
      .filter((blockId) => tableOrder.has(blockId))
      .sort((a, b) => (tableOrder.get(a) ?? 0) - (tableOrder.get(b) ?? 0));
    if (displayBlock === undefined) continue;

    const cell = cellOf(displayBlock);
    cell.ownCount += 1;
    const cents = expenseTotalCents(expense, plan.plan.traveler_count);
    if (cents === null) cell.unfilledCount += 1;
    else cell.ownCents += cents;
    for (const blockId of others) cellOf(blockId).sharedElsewhere = true;
  }
  return cells;
}

/**
 * 通过筛选、挂了块、但挂的块一个都没通过筛选（安排表里找不到）的开销，填了的金额合计（分，人均的按人数乘过）。
 * 只开「只看没划掉的」时一定是 0：开销看挂的块有没有划掉来计入，计入了就说明挂的块里有没划掉的。
 */
export function moneyOnHiddenBlocks(plan: PlanView, filter?: StatsFilter): number {
  let cents = 0;
  for (const expense of plan.expenses.values()) {
    if (expense.block_ids.length === 0 || !expensePasses(expense, plan, filter)) continue;
    const shown = expense.block_ids.some((blockId) => {
      const block = plan.blocks.get(blockId);
      return block !== undefined && passesFilter(block, filter);
    });
    if (!shown) cents += expenseTotalCents(expense, plan.plan.traveler_count) ?? 0;
  }
  return cents;
}

/** 开销格里没有开销可显示：没有开销格，或者自己没开销、也不是共用（只挂着类型被筛掉的开销）。 */
export function moneyCellEmpty(cell: MoneyCell | undefined): boolean {
  return cell === undefined || (cell.ownCount === 0 && !cell.sharedElsewhere);
}

/** 开销格的字：「填开销」「未填」「¥300」「¥158.50 · 2 笔」「共用」「¥30 含共用」。 */
export function moneyCellLabel(cell: MoneyCell | undefined): string {
  if (cell === undefined || moneyCellEmpty(cell)) return "填开销";
  if (cell.ownCount === 0) return "共用";
  const own =
    cell.ownCount === 1
      ? cell.unfilledCount === 1
        ? "未填"
        : formatYuan(cell.ownCents)
      : `${formatYuan(cell.ownCents)} · ${cell.ownCount} 笔`;
  return cell.sharedElsewhere ? `${own} 含共用` : own;
}

/** 开销格下面那一行：按类型筛时块上还挂着别的类型的开销，写「另有别的类型的开销」；没有是 null。 */
export function moneyCellNote(cell: MoneyCell | undefined): string | null {
  return cell?.otherKinds ? "另有别的类型的开销" : null;
}
