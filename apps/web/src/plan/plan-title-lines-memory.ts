/** 横条上的标题写几行：拉动条从 1 拖到 4（你提的：跟横向放大一样，新增一个上下维度的拉动条） */
export const TITLE_LINES_MIN = 1;
export const TITLE_LINES_MAX = 4;

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同「横向放大」）
function keyOf(planId: string): string {
  return `welshonion.title-lines.${planId}`;
}

/** 这个计划上次拖到几行；没存过、存的不是数都算 1 行，超出范围的夹回来。 */
export function readTitleLines(planId: string): number {
  const stored = Number(localStorage.getItem(keyOf(planId)));
  if (!Number.isFinite(stored) || stored === 0) return TITLE_LINES_MIN;
  return Math.min(TITLE_LINES_MAX, Math.max(TITLE_LINES_MIN, Math.round(stored)));
}

export function saveTitleLines(planId: string, lines: number): void {
  localStorage.setItem(keyOf(planId), String(lines));
}
