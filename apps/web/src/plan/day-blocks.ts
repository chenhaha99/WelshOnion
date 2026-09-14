import type { BlockView, PlanView } from "@welshonion/core";

/**
 * 这天安排表里的块，按显示顺序：有时间的按开始时刻（同一时刻按 id）排在前面；
 * 没排时间的按整天、上午、下午、晚上，同一格里按这天的排序。跨午夜的块只算开始那天。
 */
export function blocksOfDay(plan: PlanView, baseId: string): BlockView[] {
  const timed = [...plan.blocks.values()]
    .filter((block) => block.start_base_id === baseId && block.start_minute !== null)
    .sort((a, b) => (a.start_minute ?? 0) - (b.start_minute ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const groups = plan.undated.get(baseId);
  const undatedIds = groups ? [...groups.day, ...groups.morning, ...groups.afternoon, ...groups.evening] : [];
  const undated = undatedIds.flatMap((id) => {
    const block = plan.blocks.get(id);
    return block ? [block] : [];
  });

  return [...timed, ...undated];
}
