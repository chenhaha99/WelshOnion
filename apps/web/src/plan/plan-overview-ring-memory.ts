import type { RingKind } from "./KindRing";

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身，导出、协作时都不该带着
function keyOf(planId: string): string {
  return `welshonion.overview-ring.${planId}`;
}

/** 这个计划的总览上次把环拨到了哪个维度；没存过、存的不认识都算开销。 */
export function readOverviewRing(planId: string): RingKind {
  return localStorage.getItem(keyOf(planId)) === "time" ? "time" : "money";
}

export function saveOverviewRing(planId: string, kind: RingKind): void {
  localStorage.setItem(keyOf(planId), kind);
}
