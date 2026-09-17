/** 竖排（手机）时间轴的三档：每小时 24、48、96 像素 */
export const DAY_ZOOMS = [50, 100, 200] as const;
export type DayZoom = (typeof DAY_ZOOMS)[number];

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同横向放大的倍数）
function keyOf(planId: string): string {
  return `welshonion.timeline-day-zoom.${planId}`;
}

/** 这个计划上次选的档；没存过、存的不是这三档之一，都算 100。 */
export function readTimelineDayZoom(planId: string): DayZoom {
  const stored = Number(localStorage.getItem(keyOf(planId)));
  return DAY_ZOOMS.find((zoom) => zoom === stored) ?? 100;
}

export function saveTimelineDayZoom(planId: string, zoom: DayZoom): void {
  localStorage.setItem(keyOf(planId), String(zoom));
}
