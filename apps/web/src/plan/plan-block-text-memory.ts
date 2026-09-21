import { BLOCK_TEXT_DEFAULT, type BlockText } from "./timeline-geometry";

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身，导出、协作时都不该带着（同「上次看的视图」）
function keyOf(planId: string): string {
  return `welshonion.block-text.${planId}`;
}

const PARTS = ["title", "duration", "money"] as const;

/** 这个计划上次开着「条上写」的哪几样；没存过、或者存的认不出，就用 fallback（电脑上只写标题，手机上写标题和时长）。 */
export function readBlockText(planId: string, fallback: BlockText = BLOCK_TEXT_DEFAULT): BlockText {
  const stored = localStorage.getItem(keyOf(planId));
  if (stored === null) return fallback;
  const parts = stored.split(",").filter((part) => part !== "");
  if (parts.some((part) => !PARTS.includes(part as (typeof PARTS)[number]))) return fallback;
  return { title: parts.includes("title"), duration: parts.includes("duration"), money: parts.includes("money") };
}

export function saveBlockText(planId: string, value: BlockText): void {
  localStorage.setItem(keyOf(planId), PARTS.filter((part) => value[part]).join(","));
}
