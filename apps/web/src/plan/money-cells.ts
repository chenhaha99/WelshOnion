import { expenseTotalCents, type PlanView } from "@welshonion/core";
import { blocksOfDay } from "./day-blocks";
import { formatYuan } from "./money";

export interface MoneyCell {
  /** 以这块为显示块的钱里，填了金额的合计（分，人均的已按人数乘过） */
  ownCents: number;
  /** 以这块为显示块的钱有几笔（含没填金额的） */
  ownCount: number;
  /** 其中没填金额的笔数 */
  unfilledCount: number;
  /** 这块还挂着显示块在别处的共用钱 */
  sharedElsewhere: boolean;
}

/**
 * 每个挂了钱的块的钱格摘要。一笔钱挂多个块时，「显示块」是表里最早的那块
 * （先按天的顺序、再按这天安排表的顺序），只算进它；其他块记成「共用」。不挂块的钱不进钱格。
 */
export function moneyCells(plan: PlanView): Map<string, MoneyCell> {
  const tableOrder = new Map<string, number>();
  for (const base of plan.bases) {
    for (const block of blocksOfDay(plan, base.id)) tableOrder.set(block.id, tableOrder.size);
  }

  const cells = new Map<string, MoneyCell>();
  const cellOf = (blockId: string): MoneyCell => {
    let cell = cells.get(blockId);
    if (!cell) {
      cell = { ownCents: 0, ownCount: 0, unfilledCount: 0, sharedElsewhere: false };
      cells.set(blockId, cell);
    }
    return cell;
  };

  for (const expense of plan.expenses.values()) {
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

/** 钱格的字：「填钱」「未填」「¥300」「¥158.50 · 2 笔」「共用」「¥30 含共用」。 */
export function moneyCellLabel(cell: MoneyCell | undefined): string {
  if (!cell) return "填钱";
  if (cell.ownCount === 0) return "共用";
  const own =
    cell.ownCount === 1
      ? cell.unfilledCount === 1
        ? "未填"
        : formatYuan(cell.ownCents)
      : `${formatYuan(cell.ownCents)} · ${cell.ownCount} 笔`;
  return cell.sharedElsewhere ? `${own} 含共用` : own;
}
