import {
  baseStartUtcMs,
  blockInterval,
  effectiveLayer,
  kindLayer,
  passesFilter,
  type BlockView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";

const MS_PER_MINUTE = 60_000;
const MINUTES_PER_DAY = 1440;
/** 叠在上面的块最多缩几级 */
const MAX_DEPTH = 3;

/** 一个块画在时间轴某一行上的那一段。分钟从这一行这天的 0 点起算。 */
export interface Segment {
  blockId: string;
  /** 第几行：底座排好序后的下标 */
  row: number;
  from: number;
  to: number;
  /** 前面的行上还有这个块 */
  continuesBefore: boolean;
  /** 后面的行上还有这个块，或者截在了最后一行 */
  continuesAfter: boolean;
}

export interface PlacedSegment extends Segment {
  track: "main" | "background";
  /** 主轨第几道、背景第几条，从 1 数 */
  lane: number;
  /** 比自己类型的层高几层，最多 3；背景条是 0 */
  depth: number;
}

/** 按道（条）、再按开始、再按缩进排：这就是键盘 Tab 走的顺序，外层块排在叠在它上面的块前面 */
export interface RowLayout {
  background: PlacedSegment[];
  main: PlacedSegment[];
  backgroundCount: number;
  /** 主轨几道，至少 1 */
  laneCount: number;
}

interface Item {
  segment: Segment;
  layer: number;
  kindLayer: number;
}

/**
 * 排上时间、通过筛选的块，各画在哪几行、从几分到几分；先按行、再按开始、再按 id 排。
 * 一个块怎么分段见 blockSegments。
 */
export function timelineSegments(plan: PlanView, filter?: StatsFilter): Segment[] {
  const segments: Segment[] = [];
  for (const block of plan.blocks.values()) {
    if (passesFilter(block, filter)) segments.push(...blockSegments(plan, block));
  }
  return segments.sort((a, b) => a.row - b.row || a.from - b.from || compareIds(a.blockId, b.blockId));
}

/**
 * 一个块画在哪几行、从几分到几分，按行的先后；没排时间的块没有段。
 * 从块开始的那一行往下走，每行只画还没画过、又落在这一天之内的时间（按绝对时刻算，跨时区不会画两遍），
 * 画到最后一行还没完就截在 24 点。夏令时换时的那一天差 1 小时，和 baseStartUtcMs 一样不管。
 */
export function blockSegments(plan: PlanView, block: BlockView): Segment[] {
  if (block.start_minute === null) return [];
  const dayStarts = dayStartsOf(plan);
  const startRow = plan.bases.findIndex((base) => base.id === block.start_base_id);
  const { start, end } = blockInterval(block, plan.bases[startRow]!)!;
  if (start === end) {
    const minute = block.start_minute;
    return [{ blockId: block.id, row: startRow, from: minute, to: minute, continuesBefore: false, continuesAfter: false }];
  }

  const segments: Segment[] = [];
  let drawnUntil = start;
  for (let row = startRow; row < plan.bases.length && drawnUntil < end; row++) {
    const dayStart = dayStarts[row]!;
    const from = Math.max(drawnUntil, dayStart);
    const to = Math.min(end, dayStart + MINUTES_PER_DAY * MS_PER_MINUTE);
    if (from >= to) continue;
    segments.push({
      blockId: block.id,
      row,
      from: (from - dayStart) / MS_PER_MINUTE,
      to: (to - dayStart) / MS_PER_MINUTE,
      continuesBefore: from > start,
      continuesAfter: to < end,
    });
    drawnUntil = to;
  }
  return segments;
}

const dayStartsCache = new WeakMap<PlanView, number[]>();

/** 每一行这天 0 点的绝对时刻。换算时区不便宜，同一份计划视图只算一次。 */
function dayStartsOf(plan: PlanView): number[] {
  let dayStarts = dayStartsCache.get(plan);
  if (!dayStarts) {
    dayStarts = plan.bases.map((base) => baseStartUtcMs(base.date, base.tz));
    dayStartsCache.set(plan, dayStarts);
  }
  return dayStarts;
}

/**
 * 一行的段分到主轨和背景条：类型层等于资料库里最上层的进主轨，更低的进背景条（预设里是停留、住宿）。
 * 类型被删的块按最上层算。
 */
export function layoutRow(segments: readonly Segment[], plan: PlanView, library: LibraryView): RowLayout {
  const topKindLayer = Math.max(...[...library.kinds.values()].map((kind) => kind.layer));
  const items = segments.map((segment): Item => {
    const block = plan.blocks.get(segment.blockId)!;
    return { segment, layer: effectiveLayer(block, library), kindLayer: kindLayer(block, library) };
  });
  const background = placeBackground(items.filter((item) => item.kindLayer < topKindLayer));
  const main = placeMain(items.filter((item) => item.kindLayer >= topKindLayer));
  return {
    background,
    main,
    backgroundCount: Math.max(0, ...background.map((item) => item.lane)),
    laneCount: Math.max(1, ...main.map((item) => item.lane)),
  };
}

/**
 * 主轨分道：有效层从低到高、开始从早到晚、长的先，挨个放进最上面放得下的那道。
 * 一道里不能有有效层一样、时间又重叠的块；有效层更高的叠画在上面。
 * 时间被有效层更低的块完全包住时，放进最里面那个外层块的那一道（放得下的话）。
 */
function placeMain(items: readonly Item[]): PlacedSegment[] {
  const placed: Array<{ item: Item; lane: number }> = [];
  for (const item of [...items].sort((a, b) => a.layer - b.layer || startOrder(a.segment, b.segment))) {
    // 先放的层都不比它高，所以只会和同层的挤
    const fits = (lane: number) =>
      !placed.some(
        (other) => other.lane === lane && other.item.layer >= item.layer && overlaps(other.item.segment, item.segment),
      );
    const container = placed
      .filter((other) => other.item.layer < item.layer && contains(other.item.segment, item.segment))
      .sort(
        (a, b) =>
          b.item.layer - a.item.layer || length(a.item.segment) - length(b.item.segment) || a.lane - b.lane,
      )[0];

    let lane = 1;
    if (container && fits(container.lane)) lane = container.lane;
    else while (!fits(lane)) lane += 1;
    placed.push({ item, lane });
  }
  return placed
    .map(({ item, lane }): PlacedSegment => ({
      ...item.segment,
      track: "main",
      lane,
      depth: Math.min(MAX_DEPTH, Math.max(0, item.layer - item.kindLayer)),
    }))
    .sort(visualOrder);
}

/** 背景条：类型层从低到高、开始从早到晚、长的先，挨个放进第一条时间不重叠的细条（细条太薄，叠不下）。 */
function placeBackground(items: readonly Item[]): PlacedSegment[] {
  const placed: Array<{ item: Item; lane: number }> = [];
  for (const item of [...items].sort((a, b) => a.kindLayer - b.kindLayer || startOrder(a.segment, b.segment))) {
    let lane = 1;
    while (placed.some((other) => other.lane === lane && overlaps(other.item.segment, item.segment))) lane += 1;
    placed.push({ item, lane });
  }
  return placed
    .map(({ item, lane }): PlacedSegment => ({ ...item.segment, track: "background", lane, depth: 0 }))
    .sort(visualOrder);
}

function visualOrder(a: PlacedSegment, b: PlacedSegment): number {
  return a.lane - b.lane || a.from - b.from || a.depth - b.depth || compareIds(a.blockId, b.blockId);
}

function startOrder(a: Segment, b: Segment): number {
  return a.from - b.from || length(b) - length(a) || compareIds(a.blockId, b.blockId);
}

/** 半开区间相交算重叠；有一边是点（时长为 0）时，碰到两头也算。 */
function overlaps(a: Segment, b: Segment): boolean {
  if (a.from === a.to || b.from === b.to) return a.from <= b.to && b.from <= a.to;
  return a.from < b.to && b.from < a.to;
}

function contains(outer: Segment, inner: Segment): boolean {
  return outer.from <= inner.from && inner.to <= outer.to;
}

function length(segment: Segment): number {
  return segment.to - segment.from;
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
