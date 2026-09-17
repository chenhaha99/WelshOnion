import type { BlockView, ExpenseView, PlanView } from "../read";

/** 统计时只看哪些类型、要不要去掉划掉的；不给就是都看。被筛掉的块不参与任何计算。 */
export interface StatsFilter {
  kindIds?: readonly string[];
  /** 只看没划掉的 */
  onlyUnchecked?: true;
}

export function passesFilter(block: BlockView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(block.kind.id)) return false;
  if (filter.onlyUnchecked && block.checked) return false;
  return true;
}

/**
 * 一笔钱是否计入：按类型筛看钱自己的类型；只看没划掉的，看它挂的块——有一块没划掉就算，
 * 不挂块的钱不受影响。
 */
export function expensePasses(expense: ExpenseView, plan: PlanView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(expense.kind.id)) return false;
  if (!filter.onlyUnchecked || expense.block_ids.length === 0) return true;
  return expense.block_ids.some((id) => plan.blocks.get(id)?.checked === false);
}

export function filteredBlocks(plan: PlanView, filter?: StatsFilter): BlockView[] {
  return [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
}
