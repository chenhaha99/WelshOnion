import type { PlanView } from "@welshonion/core";
import type { CSSProperties } from "react";

// 横排、竖排时间轴共用的画法：位置按一天 1440 分钟的百分比算，换方向时只是换成上下

export const MINUTES_PER_DAY = 1440;
/** 类型被删了的块用这个灰色 */
const DELETED_COLOR = "#9aa3ad";
/** 刻度写 0、2、4……24 点；每小时一根淡线 */
export const HOUR_TICKS = Array.from({ length: 13 }, (_, index) => index * 2);
export const HOUR_LINES = Array.from({ length: 23 }, (_, index) => index + 1);

/** 这天第几分钟占一天的百分之几：「37.5%」。 */
export function percent(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`;
}

/** 块的类型色，放进 `--kind-color` 给样式用。 */
export function kindColor(plan: PlanView, blockId: string): CSSProperties {
  const kind = plan.blocks.get(blockId)!.kind;
  return { "--kind-color": kind.deleted ? DELETED_COLOR : kind.color } as CSSProperties;
}
