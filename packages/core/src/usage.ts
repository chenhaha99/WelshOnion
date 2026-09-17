import type { PlanView } from "./read";

/**
 * 删除类型、标签前给确认框用：当前这个计划里有几个块在用。
 * 只数得出这一个计划——别的计划在别的文档里，扫不到。
 */
export function countBlocksUsing(plan: PlanView, ref: { kindId: string } | { tagId: string }): number {
  let count = 0;
  for (const block of plan.blocks.values()) {
    const using = "kindId" in ref ? block.kind.id === ref.kindId : block.tag_ids.includes(ref.tagId);
    if (using) count++;
  }
  return count;
}
