/** 时间轴横向放大的档位（百分之几） */
export const ZOOM_STEPS = [100, 150, 200, 300] as const;

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同「上次看的视图」）
function keyOf(planId: string): string {
  return `welshonion.timeline-zoom.${planId}`;
}

/** 这个计划上次选的倍数；没存过、存的不是档位里的数，都算 100。 */
export function readTimelineZoom(planId: string): number {
  const stored = Number(localStorage.getItem(keyOf(planId)));
  return (ZOOM_STEPS as readonly number[]).includes(stored) ? stored : 100;
}

export function saveTimelineZoom(planId: string, zoom: number): void {
  localStorage.setItem(keyOf(planId), String(zoom));
}
