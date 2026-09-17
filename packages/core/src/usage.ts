import type { PlanView } from "./read";

/**
 * 删除类型前给确认框用：当前这个计划里有几个块在用。
 * 只数得出这一个计划——别的计划在别的文档里，扫不到。
 */
export function countBlocksUsing(plan: PlanView, ref: { kindId: string }): number {
  let count = 0;
  for (const block of plan.blocks.values()) {
    if (block.kind.id === ref.kindId) count++;
  }
  return count;
}
