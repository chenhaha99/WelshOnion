import type { BlockView, PlanView } from "../read";

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

export function filteredBlocks(plan: PlanView, filter?: StatsFilter): BlockView[] {
  return [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
}
