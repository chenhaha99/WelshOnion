import type { BlockView, ExpenseView, PlanView } from "../read";

/** 统计时只看哪些状态、哪些类型；不给就是都看。被筛掉的块不参与任何计算。 */
export interface StatsFilter {
  statusIds?: readonly string[];
  kindIds?: readonly string[];
  /** 只看没勾的 */
  onlyUnchecked?: true;
}

export function passesFilter(block: BlockView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.statusIds && !filter.statusIds.includes(block.status.id)) return false;
  if (filter.kindIds && !filter.kindIds.includes(block.kind.id)) return false;
  if (filter.onlyUnchecked && block.checked) return false;
  return true;
}

/**
 * 一笔钱是否计入：按类型筛看钱自己的类型；按状态筛、只看没勾的，都看它挂的块——有一块同时满足就算，
 * 不挂块的钱不受这两种筛选影响。
 */
export function expensePasses(expense: ExpenseView, plan: PlanView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(expense.kind.id)) return false;
  const { statusIds, onlyUnchecked } = filter;
  if ((!statusIds && !onlyUnchecked) || expense.block_ids.length === 0) return true;
  return expense.block_ids.some((id) => {
    const block = plan.blocks.get(id);
    if (block === undefined) return false;
    if (statusIds && !statusIds.includes(block.status.id)) return false;
    return !(onlyUnchecked && block.checked);
  });
}

export function filteredBlocks(plan: PlanView, filter?: StatsFilter): BlockView[] {
  return [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
}
