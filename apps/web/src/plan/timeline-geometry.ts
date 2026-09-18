import { kindLayer, type LibraryView, type PlanView } from "@welshonion/core";
import type { CSSProperties } from "react";
import type { PlacedSegment, RowLayout } from "./timeline-layout";

// 横条、竖条画在哪：画（Timeline、DayTimeline）和拖动中量指针落在哪块上（timeline-drop）共用这一份

/** 横排：背景条每条多高（像素） */
export const STRIP_HEIGHT = 16;

/** 块上写什么：标题、时长、开销三个开关，各自能开能关。按计划记在这台设备上（plan-block-text-memory）。 */
export interface BlockText {
  title: boolean;
  duration: boolean;
  money: boolean;
}

/** 没选过就是只写标题。 */
export const BLOCK_TEXT_DEFAULT: BlockText = { title: true, duration: false, money: false };

/**
 * 横条、竖条分上中下三区（你提的：上面一行是书签栏，中间是标题，最下面是附件栏），各多高（像素）：
 * 书签栏是书签 11 加下面空 1；标题一行 16；附件栏是上面空 2 加一行 14。
 * 没有书签栏时上边留 2，没有附件栏时下边留 4；块的上下边框各 1。
 */
export const TAG_BAR = 12;
export const TITLE_LINE = 16;
export const FOOT_BAR = 16;
const TOP_PAD = 2;
const BOTTOM_PAD = 4;
const BORDERS = 2;
/** 横条最矮多高：一行字那么高，好点、好拖 */
const MIN_BAR = 24;
/** 套在里面的块每级最少往下让多少：一行字 16 加 2（关掉标题时外层块也还有一截点得着） */
const MIN_NEST = 18;

/** 块分哪几区：有没有书签栏、标题写几行（0 是不写标题）、有没有附件栏（时长、开销）。 */
export interface BarZones {
  tagBar: boolean;
  lines: number;
  foot: boolean;
}

/**
 * 横排的块怎么分区：哪一区一定没东西就不占地方（AI 推的）——没有横条挂着标签就没有书签栏（tagBar 由外面按 planHasBarTags 算），
 * 「时长」「开销」都关就没有附件栏，「标题」关掉就不写字（行数拉动条不管用）。
 */
export function barZones(blockText: BlockText, titleLines: number, tagBar: boolean): BarZones {
  return { tagBar, lines: blockText.title ? titleLines : 0, foot: blockText.duration || blockText.money };
}

/** 书签栏（或上边留的空）有多高 */
function topHeight(zones: BarZones): number {
  return zones.tagBar ? TAG_BAR : TOP_PAD;
}

/** 这样分区的横条多高（像素）。 */
export function barHeight(zones: BarZones): number {
  return Math.max(MIN_BAR, BORDERS + topHeight(zones) + zones.lines * TITLE_LINE + (zones.foot ? FOOT_BAR : BOTTOM_PAD));
}

/** 横排主轨：每道多高、套在里面的每级往下让多少（像素）。画和拖动中量指针落在哪块上都用它。 */
export interface WideMetrics {
  lane: number;
  nest: number;
}

/** 每道是横条高加上下各留 2；套在里面的往下让出外层块的书签栏和标题那几行，外层块的书签和整段标题都露在上面。 */
export function wideMetrics(zones: BarZones): WideMetrics {
  return {
    lane: barHeight(zones) + 2 * GAP,
    nest: Math.max(MIN_NEST, topHeight(zones) + zones.lines * TITLE_LINE),
  };
}

/**
 * 这个计划里有没有画成横条（竖排是竖条）的事挂着标签：排上了时间、有时长、画在主轨上（类型层是资料库里最上层）。
 * 有才给横条、竖条留书签栏；背景细条、时长为 0 的竖线挂着标签不算，它们不画书签栏。
 * 看整个计划、不看筛选，点筛选时版面不上下跳。
 */
export function planHasBarTags(plan: PlanView, library: LibraryView): boolean {
  const topLayer = Math.max(...[...library.kinds.values()].map((kind) => kind.layer));
  for (const block of plan.blocks.values()) {
    if (block.start_minute === null || !block.duration_min || block.tag_ids.length === 0) continue;
    if (kindLayer(block, library) >= topLayer) return true;
  }
  return false;
}

/**
 * 竖排一根竖条怎么分区：竖条的高度就是时长，中间的标题能写几整行写几行（至少一行）。
 * 放不下「书签栏 + 一行字」就不要书签栏（书签也不画），放不下附件栏就不要附件栏。
 */
export function dayBarZones(heightPx: number, blockText: BlockText, tagBar: boolean): BarZones {
  const title = blockText.title ? TITLE_LINE : 0;
  const withTagBar = tagBar && heightPx >= BORDERS + TAG_BAR + title + BOTTOM_PAD;
  const top = withTagBar ? TAG_BAR : TOP_PAD;
  const foot = (blockText.duration || blockText.money) && heightPx >= BORDERS + top + title + FOOT_BAR;
  const room = heightPx - BORDERS - top - (foot ? FOOT_BAR : BOTTOM_PAD);
  return { tagBar: withTagBar, lines: blockText.title ? Math.max(1, Math.floor(room / TITLE_LINE)) : 0, foot };
}

/** 块和块之间留多少（像素），横排竖排一样；竖排里叠在上面的块每级往右缩多少 */
export const GAP = 2;
export const DEPTH_INSET = 4;
/** 竖排：放大 100% 时每小时多高、背景细条每条多宽（像素） */
export const HOUR_HEIGHT = 48;
export const STRIP_WIDTH = 12;
/** 时长为 0 的块画成一条线，点和量都按这么宽（像素），同 index.css 的 timeline-marker、timeline-marker-h */
export const MARKER_HIT = 12;
/** 拖动中拿起来的块压在别的块上面（别的块是 1 + 缩几级） */
export const LIFTED_Z_INDEX = 10;
/**
 * 横排时间轴最下面一直留着的空（像素），放得下选中最后一行时浮出来的快捷条。
 * 快捷条浮着、不占行高（选中不把下面的行顶下去）；但横着滚的框竖着也会裁：不留这一截，
 * 选中最后一行的事时快捷条会把框撑得能竖着滚（滚轮一推钟点那一行就滚没了），底边还被裁掉。
 * 一直留着而不是选中才留，是为了选中、取消选中时卡片不变高。
 */
export const QUICK_BAR_ROW_PX = 36;

/** 横排上方背景细条一共多高。 */
export function wideStripsHeight(layout: RowLayout): number {
  return layout.backgroundCount * STRIP_HEIGHT;
}

/**
 * 横排第 lane 道有多高：本来的道高，加上这道里最深缩几级（每级让出外层块的书签栏和标题）。
 * 只有套着块的那一道变高：别的道不动，指针底下的块就不会因为别处套了东西而挪位置。
 */
export function wideLaneHeight(layout: RowLayout, metrics: WideMetrics, lane: number): number {
  return metrics.lane + (layout.laneDepths[lane - 1] ?? 0) * metrics.nest;
}

/** 横排第 lane 道的上边离横轴顶多远（像素）：背景细条，加上它前面几道。 */
export function wideLaneTop(layout: RowLayout, metrics: WideMetrics, lane: number): number {
  let top = wideStripsHeight(layout);
  for (let before = 1; before < lane; before++) top += wideLaneHeight(layout, metrics, before);
  return top;
}

/** 横排一行的横轴至少多高：背景细条加主轨的每一道。 */
export function wideAxisHeight(layout: RowLayout, metrics: WideMetrics): number {
  return wideLaneTop(layout, metrics, layout.laneCount + 1);
}

/**
 * 横排一段在这一行横轴里的上边和高度（像素）：背景块在上方的细条里；
 * 主轨在细条下面分道，套在里面的每级往下让出外层块的书签栏和标题、底边对齐。
 */
export function wideSegmentBox(item: PlacedSegment, layout: RowLayout, metrics: WideMetrics): { top: number; height: number } {
  if (item.track === "background") return { top: (item.lane - 1) * STRIP_HEIGHT, height: STRIP_HEIGHT - GAP };
  return {
    top: wideLaneTop(layout, metrics, item.lane) + GAP + item.depth * metrics.nest,
    height: wideLaneHeight(layout, metrics, item.lane) - 2 * GAP - item.depth * metrics.nest,
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
