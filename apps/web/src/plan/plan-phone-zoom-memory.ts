import { ZOOM_MAX } from "./phone-zoom";

// 按计划记在这台设备上，不进计划文档：这是怎么看，不是计划本身（同电脑上的横向放大）
function keyOf(planId: string): string {
  return `welshonion.phone-zoom.${planId}`;
}

/** 这个计划手机上上次放大到几倍；没存过、存的不是数都算 1 倍，超出范围的夹回来。 */
export function readPhoneZoom(planId: string): number {
  const stored = Number(localStorage.getItem(keyOf(planId)));
  if (!Number.isFinite(stored) || stored === 0) return 1;
  return Math.min(ZOOM_MAX, Math.max(1, stored));
}

export function savePhoneZoom(planId: string, zoom: number): void {
  localStorage.setItem(keyOf(planId), String(zoom));
}
