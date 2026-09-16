import type { BlockText } from "./timeline-geometry";

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身，导出、协作时都不该带着（同「上次看的视图」）
function keyOf(planId: string): string {
  return `welshonion.block-text.${planId}`;
}

/** 这个计划上次选的「块上写」；没存过是只写标题。 */
export function readBlockText(planId: string): BlockText {
  return localStorage.getItem(keyOf(planId)) === "money" ? "money" : "title";
}

export function saveBlockText(planId: string, value: BlockText): void {
  localStorage.setItem(keyOf(planId), value);
}
