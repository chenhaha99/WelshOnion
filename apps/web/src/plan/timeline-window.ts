import { kindLayer, type LibraryView, type PlanView } from "@welshonion/core";
import { timelineSegments, type Segment } from "./timeline-layout";

/*
 * 横排横轴画哪几个钟点，和横轴上位置、时刻怎么互换。没事的凌晨和深夜默认折起：
 * 展开的那段按真实比例铺满，两头折起的钟点各压在 24 像素里接着画（不整个藏掉，跨夜的住宿不断开，拖着也进得去）。
 */

const MINUTES_PER_DAY = 1440;
/** 默认展开的那段：07:00–21:00 */
const DEFAULT_FROM = 7 * 60;
const DEFAULT_TO = 21 * 60;
/** 时长为 0 的事前后各多留多少分钟：画在边上会被折起的那一截盖住一半 */
const POINT_MARGIN_MIN = 30;

/** 折起的那一截多宽（像素） */
export const FOLD_PX = 24;

/** 横轴展开的那段：从第几分钟到第几分钟，都是整点 */
export interface HourWindow {
  from: number;
  to: number;
}

export const FULL_DAY: HourWindow = { from: 0, to: MINUTES_PER_DAY };

/**
 * 画哪几个钟点。按下了「0–24 点」是整天；否则从 07:00–21:00 起，看整个计划（不看筛选：点筛选时横轴不跟着伸缩）：
 * 主轨上的事每一段都整个画得下（放到它开始、结束的整点）；背景条按一件事算，
 * 有一段和放过以后的范围沾边就露得出来（晚到的民宿第二天早上那段看得见），每一段都不沾的才放到画得下它。
 * `foldTails`：手机上用，前一天延续过来的那一截不算。
 */
export function hourWindow(
  plan: PlanView,
  library: LibraryView,
  fullDay: boolean,
  { foldTails = false }: { foldTails?: boolean } = {},
): HourWindow {
  if (fullDay) return FULL_DAY;
  const topKindLayer = Math.max(...[...library.kinds.values()].map((kind) => kind.layer));
  const range = { from: DEFAULT_FROM, to: DEFAULT_TO };
  const background = new Map<string, Segment[]>();
  for (const segment of timelineSegments(plan)) {
    // 手机上：前一天延续过来的那一截（夜车、住宿的第二天早上）不撑开横轴，挤进左边折起的那一截。
    // 手机上一小时本来就只有十几像素，被它撑到 0 点就只剩 9 像素，块全挤在一起
    if (foldTails && segment.continuesBefore) continue;
    if (kindLayer(plan.blocks.get(segment.blockId)!, library) < topKindLayer) {
      background.set(segment.blockId, [...(background.get(segment.blockId) ?? []), segment]);
    } else {
      include(range, segment);
    }
  }
  for (const segments of background.values()) {
    if (segments.some((segment) => segment.to > range.from && segment.from < range.to)) continue;
    for (const segment of segments) include(range, segment);
  }
  return { from: Math.max(0, range.from), to: Math.min(MINUTES_PER_DAY, range.to) };
}

/** 把范围放到画得下这一段：往外取整点，时长为 0 的前后各多留半小时。 */
function include(range: HourWindow, segment: Segment): void {
  const margin = segment.from === segment.to ? POINT_MARGIN_MIN : 0;
  range.from = Math.min(range.from, floorHour(segment.from - margin));
  range.to = Math.max(range.to, ceilHour(segment.to + margin));
}

/** 横轴上的位置写成「像素 + 横轴宽的百分之几」两部分：折起的那一截是固定像素，展开的那段按比例。 */
export interface AxisOffset {
  px: number;
  pct: number;
}

/** 这一行第几分钟画在横轴的哪：左边那一截、展开的那段、右边那一截是三段直线；出了 0–24 点按展开那段的比例接着算。 */
export function axisOffset(window: HourWindow, minute: number): AxisOffset {
  const { before, after } = foldWidths(window);
  const span = window.to - window.from;
  if (minute < 0 || minute > MINUTES_PER_DAY) {
    const beyond = minute < 0 ? minute : minute - MINUTES_PER_DAY;
    const share = beyond / span;
    return { px: -(before + after) * share, pct: (minute < 0 ? 0 : 100) + 100 * share };
  }
  if (minute < window.from) return { px: (before * minute) / window.from, pct: 0 };
  if (minute > window.to) {
    return { px: -after + (after * (minute - window.to)) / (MINUTES_PER_DAY - window.to), pct: 100 };
  }
  const share = (minute - window.from) / span;
  return { px: before - (before + after) * share, pct: 100 * share };
}

/** 从 from 到 to 占多宽，也写成两部分。 */
export function spanOffset(window: HourWindow, from: number, to: number): AxisOffset {
  const start = axisOffset(window, from);
  const end = axisOffset(window, to);
  return { px: end.px - start.px, pct: end.pct - start.pct };
}

/** 写成 CSS：像素部分是 0 时就是百分比（整天画时和按 1440 平分一模一样）。 */
export function offsetCss({ px, pct }: AxisOffset): string {
  return px === 0 ? `${pct}%` : `calc(${px}px + ${pct}%)`;
}

/** 横轴宽 width 像素时，第几分钟离横轴左边多少像素。 */
export function axisPixel(window: HourWindow, minute: number, width: number): number {
  const { px, pct } = axisOffset(window, minute);
  return px + (pct / 100) * width;
}

/** 反过来：离横轴左边 x 像素是这一行第几分钟（不夹在 0–1440 里）。 */
export function minuteAtPixel(window: HourWindow, x: number, width: number): number {
  const { before, after } = foldWidths(window);
  const inner = width - before - after;
  const span = window.to - window.from;
  if (x < 0) return (x / inner) * span;
  if (x < before) return (x / before) * window.from;
  if (x <= width - after) return window.from + ((x - before) / inner) * span;
  if (x <= width) return window.to + ((x - (width - after)) / after) * (MINUTES_PER_DAY - window.to);
  return MINUTES_PER_DAY + ((x - width) / inner) * span;
}

/** 刻度写哪几个钟点：展开那段的两头，加上中间的偶数钟点。 */
export function hourTicks(window: HourWindow): number[] {
  const first = window.from / 60;
  const last = window.to / 60;
  const ticks = [];
  for (let hour = first; hour <= last; hour++) {
    if (hour === first || hour === last || hour % 2 === 0) ticks.push(hour);
  }
  return ticks;
}

/** 每小时的淡线画在哪几个钟点：只画在展开的那段里，两头不画。 */
export function hourLines(window: HourWindow): number[] {
  const lines = [];
  for (let hour = window.from / 60 + 1; hour < window.to / 60; hour++) lines.push(hour);
  return lines;
}

/** 两头折起的那一截各多宽：没折的那一头是 0。 */
export function foldWidths(window: HourWindow): { before: number; after: number } {
  return { before: window.from > 0 ? FOLD_PX : 0, after: window.to < MINUTES_PER_DAY ? FOLD_PX : 0 };
}

function floorHour(minute: number): number {
  return Math.floor(minute / 60) * 60;
}

function ceilHour(minute: number): number {
  return Math.ceil(minute / 60) * 60;
}
