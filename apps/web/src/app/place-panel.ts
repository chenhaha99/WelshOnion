import type { CSSProperties } from "react";

/** 面板离屏幕边至少留多少、离按钮隔多少（像素） */
export const VIEWPORT_MARGIN = 8;
export const PANEL_GAP = 4;

/**
 * 按按钮（或别的锚点）在屏幕上的位置摆面板。面板还没挂上时用估计高度、宽度当 0 算，挂上后再按真实大小摆一次。
 * 往下放不下、上面空间又更大，就往上放；最大高度就是那一边剩下的空间；左右夹在屏幕里。
 * 弹层（Popover）和贴着按钮的详情气泡（AnchoredCard）共用这一份。
 */
export function placePanel(
  anchor: HTMLElement,
  panel: HTMLElement | null,
  align: "start" | "end",
  estimatedHeight: number,
): CSSProperties {
  const rect = anchor.getBoundingClientRect();
  const roomBelow = window.innerHeight - rect.bottom - PANEL_GAP - VIEWPORT_MARGIN;
  const roomAbove = rect.top - PANEL_GAP - VIEWPORT_MARGIN;
  const wantedHeight = panel ? panel.scrollHeight : estimatedHeight;
  const placeAbove = wantedHeight > roomBelow && roomAbove > roomBelow;

  const width = panel ? panel.offsetWidth : 0;
  const preferredLeft = align === "end" ? rect.right - width : rect.left;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - width - VIEWPORT_MARGIN));

  return placeAbove
    ? { left, bottom: window.innerHeight - rect.top + PANEL_GAP, maxHeight: Math.max(0, roomAbove) }
    : { left, top: rect.bottom + PANEL_GAP, maxHeight: Math.max(0, roomBelow) };
}
