// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同横向放大的倍数）
function keyOf(planId: string): string {
  return `welshonion.timeline-full-day.${planId}`;
}

/** 这个计划上次有没有按下「0–24 点」；没存过是没按下（没事的凌晨和深夜折起）。 */
export function readTimelineFullDay(planId: string): boolean {
  return localStorage.getItem(keyOf(planId)) === "1";
}

export function saveTimelineFullDay(planId: string, fullDay: boolean): void {
  if (fullDay) localStorage.setItem(keyOf(planId), "1");
  else localStorage.removeItem(keyOf(planId));
}
