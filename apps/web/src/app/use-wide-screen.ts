import { useSyncExternalStore } from "react";

/** 屏幕至少这么宽，时间线才横着铺（像素）。按「整条横轴放得下 24 小时、每小时至少 30 像素」算。 */
const WIDE_SCREEN_QUERY = "(min-width: 720px)";

/** 屏幕是不是够宽：窗口变宽变窄时跟着变。 */
export function useWideScreen(): boolean {
  return useSyncExternalStore(subscribe, isWide);
}

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE_SCREEN_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function isWide(): boolean {
  return window.matchMedia(WIDE_SCREEN_QUERY).matches;
}
