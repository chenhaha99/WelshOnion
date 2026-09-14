import type { BlockView, ExpenseView, PlanView } from "../read";

/** 统计时只看哪些状态、哪些类型；不给就是都看。被筛掉的块不参与任何计算。 */
export interface StatsFilter {
  statusIds?: readonly string[];
  kindIds?: readonly string[];
}

export function passesFilter(block: BlockView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.statusIds && !filter.statusIds.includes(block.status.id)) return false;
  if (filter.kindIds && !filter.kindIds.includes(block.kind.id)) return false;
  return true;
}

/**
 * 一笔钱是否计入：按类型筛看钱自己的类型；按状态筛看它挂的块，有一个通过就算，不挂块的钱不受状态筛选影响。
 */
export function expensePasses(expense: ExpenseView, plan: PlanView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(expense.kind.id)) return false;
  const statusIds = filter.statusIds;
  if (!statusIds || expense.block_ids.length === 0) return true;
  return expense.block_ids.some((id) => {
    const block = plan.blocks.get(id);
    return block !== undefined && statusIds.includes(block.status.id);
  });
}

export function filteredBlocks(plan: PlanView, filter?: StatsFilter): BlockView[] {
  return [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
}
