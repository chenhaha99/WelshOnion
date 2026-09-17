import type { BlockView, ExpenseView, PlanView } from "../read";

/** 统计时只看哪些类型、哪些标签、要不要去掉划掉的；不给就是都看。被筛掉的块不参与任何计算。 */
export interface StatsFilter {
  kindIds?: readonly string[];
  /** 带着其中任何一个标签的 */
  tagIds?: readonly string[];
  /** 只看没划掉的 */
  onlyUnchecked?: true;
}

export function passesFilter(block: BlockView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(block.kind.id)) return false;
  return passesBlockOnly(block, filter);
}

/**
 * 一笔钱是否计入：按类型筛看钱自己的类型；按标签筛、只看没划掉的，看它挂的块——有一块都通过就算，
 * 不挂块的钱不受这两种筛选影响。
 */
export function expensePasses(expense: ExpenseView, plan: PlanView, filter: StatsFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.kindIds && !filter.kindIds.includes(expense.kind.id)) return false;
  if ((!filter.tagIds && !filter.onlyUnchecked) || expense.block_ids.length === 0) return true;
  return expense.block_ids.some((id) => {
    const block = plan.blocks.get(id);
    return block !== undefined && passesBlockOnly(block, filter);
  });
}

/** 只能看块自己的那几样：标签、划没划掉。 */
function passesBlockOnly(block: BlockView, filter: StatsFilter): boolean {
  const { tagIds } = filter;
  if (tagIds && !block.tag_ids.some((id) => tagIds.includes(id))) return false;
  return !(filter.onlyUnchecked && block.checked);
}

export function filteredBlocks(plan: PlanView, filter?: StatsFilter): BlockView[] {
  return [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
}
