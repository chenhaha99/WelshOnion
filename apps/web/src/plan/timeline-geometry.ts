import type { CSSProperties } from "react";
import type { PlacedSegment, RowLayout } from "./timeline-layout";

// 横条、竖条画在哪：画（Timeline、DayTimeline）和拖动中量指针落在哪块上（timeline-drop）共用这一份

/** 横排：背景条每条多高；主轨每道多高——块上只写标题时 28，标题下面还写开销时 40（像素） */
export const STRIP_HEIGHT = 16;
export const LANE_HEIGHT = 28;
export const LANE_HEIGHT_WITH_MONEY = 40;

/** 块上写什么：标题、时长、开销三个开关，各自能开能关。按计划记在这台设备上（plan-block-text-memory）。 */
export interface BlockText {
  title: boolean;
  duration: boolean;
  money: boolean;
}

/** 没选过就是只写标题。 */
export const BLOCK_TEXT_DEFAULT: BlockText = { title: true, duration: false, money: false };

/** 块上写几行：标题和时长挤第一行，开销占第二行。 */
export function blockTextRows(blockText: BlockText): number {
  return (blockText.title || blockText.duration ? 1 : 0) + (blockText.money ? 1 : 0);
}

/** 这种写法下主轨每道多高（像素）：要写两行才变高。 */
export function laneHeight(blockText: BlockText): number {
  return blockTextRows(blockText) > 1 ? LANE_HEIGHT_WITH_MONEY : LANE_HEIGHT;
}
/** 块和块之间留多少、叠在上面的块每级缩多少（像素），横排竖排一样 */
export const GAP = 2;
export const DEPTH_INSET = 4;
/** 竖排：每小时多高、背景细条每条多宽（像素） */
export const HOUR_HEIGHT = 48;
export const STRIP_WIDTH = 12;
/** 时长为 0 的块画成一条线，点和量都按这么宽（像素），同 index.css 的 timeline-marker、timeline-marker-h */
export const MARKER_HIT = 12;
/** 拖动中拿起来的块压在别的块上面（别的块是 1 + 缩几级） */
export const LIFTED_Z_INDEX = 10;
/** 横排里选中一件事时，这一行多空出来放快捷条的高度（像素） */
export const QUICK_BAR_ROW_PX = 36;

/** 横排上方背景细条一共多高。 */
export function wideStripsHeight(layout: RowLayout): number {
  return layout.backgroundCount * STRIP_HEIGHT;
}

/** 横排一行的横轴至少多高：背景细条加主轨的道。 */
export function wideAxisHeight(layout: RowLayout, lane: number): number {
  return wideStripsHeight(layout) + layout.laneCount * lane;
}

/** 横排一段在这一行横轴里的上边和高度（像素）：背景块在上方的细条里；主轨在细条下面分道，叠在上面的从上面往下缩。 */
export function wideSegmentBox(item: PlacedSegment, layout: RowLayout, lane: number): { top: number; height: number } {
  if (item.track === "background") return { top: (item.lane - 1) * STRIP_HEIGHT, height: STRIP_HEIGHT - GAP };
  return {
    top: wideStripsHeight(layout) + (item.lane - 1) * lane + GAP + item.depth * DEPTH_INSET,
    height: lane - 2 * GAP - item.depth * DEPTH_INSET,
  };
}

/** 竖排左边背景细条那一栏一共多宽。 */
export function dayStripsWidth(layout: RowLayout): number {
  return layout.backgroundCount * STRIP_WIDTH;
}

/**
 * 竖排一段的左边和宽度，写成 CSS：背景块在左边的细条里；主轨在细条右边按道数平分成列，叠在上面的从左边往右缩。
 * 和 daySegmentPixels 是同一套算法。
 */
export function daySegmentStyle(item: PlacedSegment, layout: RowLayout): CSSProperties {
  if (item.track === "background") return { left: (item.lane - 1) * STRIP_WIDTH, width: STRIP_WIDTH - GAP };
  const { offset, inset } = dayColumnParts(item, layout);
  return {
    left: `calc(${offset}px + (100% - ${offset}px) * ${(item.lane - 1) / layout.laneCount} + ${inset}px)`,
    width: `calc((100% - ${offset}px) / ${layout.laneCount} - ${inset + GAP}px)`,
  };
}

/** 竖排一段在宽 axisWidth 像素的横轴里，左边和宽度（像素）。 */
export function daySegmentPixels(
  item: PlacedSegment,
  layout: RowLayout,
  axisWidth: number,
): { left: number; width: number } {
  if (item.track === "background") return { left: (item.lane - 1) * STRIP_WIDTH, width: STRIP_WIDTH - GAP };
  const { offset, inset } = dayColumnParts(item, layout);
  return {
    left: offset + ((axisWidth - offset) * (item.lane - 1)) / layout.laneCount + inset,
    width: (axisWidth - offset) / layout.laneCount - inset - GAP,
  };
}

function dayColumnParts(item: PlacedSegment, layout: RowLayout): { offset: number; inset: number } {
  const stripsWidth = dayStripsWidth(layout);
  return { offset: stripsWidth === 0 ? 0 : stripsWidth + GAP, inset: item.depth * DEPTH_INSET };
}
