/** 时间轴横向放大：百分之几，拖动条从 100 拖到 400 */
export const ZOOM_MIN = 100;
export const ZOOM_MAX = 400;

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同「上次看的视图」）
function keyOf(planId: string): string {
  return `welshonion.timeline-zoom.${planId}`;
}

/** 这个计划上次拖到的倍数；没存过、存的不是数都算 100，超出范围的夹回来。 */
export function readTimelineZoom(planId: string): number {
  const stored = Number(localStorage.getItem(keyOf(planId)));
  if (!Number.isFinite(stored) || stored === 0) return ZOOM_MIN;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(stored)));
}

export function saveTimelineZoom(planId: string, zoom: number): void {
  localStorage.setItem(keyOf(planId), String(zoom));
}
