/**
 * 手机上整条时间线的缩放（你提的：「整体放大缩小……就像我们电脑版的百分比一样」）：
 * 双指捏合，所有天一起放大，照 iMovie、Final Cut Pro for iPad；1 倍是整趟一屏。
 */

/** 最多放大到几倍：1 倍时一小时约 13 像素，8 倍约 100 像素，15 分钟 25 像素，手指对得准 */
export const ZOOM_MAX = 8;

/** 捏合：两指距离从 startDistance 变成 distance，倍数跟着乘，夹在 1 倍到 ZOOM_MAX。 */
export function pinchZoom(startZoom: number, startDistance: number, distance: number): number {
  return Math.min(Math.max((startZoom * distance) / startDistance, 1), ZOOM_MAX);
}

/**
 * 缩放以后滚到哪：两指中点下面那个钟点留在中点下面。
 * focusX 是中点离滚动框左边多远；gutter 是左边钉着的「第 N 天」那一列宽；oldWidth、newWidth 是横轴缩放前后的宽。
 */
export function anchoredScroll({
  scrollLeft,
  focusX,
  gutter,
  oldWidth,
  newWidth,
}: {
  scrollLeft: number;
  focusX: number;
  gutter: number;
  oldWidth: number;
  newWidth: number;
}): number {
  const onAxis = scrollLeft + focusX - gutter;
  return Math.max(0, (onAxis * newWidth) / oldWidth - focusX + gutter);
}
