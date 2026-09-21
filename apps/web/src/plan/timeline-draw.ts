import type { PlanView } from "@welshonion/core";
import type { CSSProperties } from "react";

// 时间线的画法：位置见 timeline-window（两头会折起）；这里是电脑上、手机上都用的类型色

export const MINUTES_PER_DAY = 1440;
/** 类型被删了的块用这个灰色 */
const DELETED_COLOR = "#9aa3ad";

/** 块的类型色，放进 `--kind-color` 给样式用。 */
export function kindColor(plan: PlanView, blockId: string): CSSProperties {
  const kind = plan.blocks.get(blockId)!.kind;
  return { "--kind-color": kind.deleted ? DELETED_COLOR : kind.color } as CSSProperties;
}
