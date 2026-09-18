/**
 * 时间统计。只呈现事实，不判断「赶不赶」「超没超」。
 */
import { effectiveLayer, kindLayer } from "../nesting";
import type { BlockView, LibraryView, PlainObject, PlanView } from "../read";
import { blockInterval } from "../time";
import { filteredBlocks, type StatsFilter } from "./filter";

const MS_PER_MINUTE = 60_000;

/** 几点起、几点收工不算这两类背景：停留、住宿（按预设 id 判断，层是用户能改的）。 */
const BACKGROUND_KIND_IDS: ReadonlySet<string> = new Set(["stay", "lodging"]);

export interface TimeByKindOptions {
  filter?: StatsFilter;
  /** 把类型层为 0 的类型（停留）也算进来，默认不算 */
  includeBaseLayer?: boolean;
  /** 只看这一天开始的块；不给就是整个计划 */
  baseId?: string;
}

export interface DayFacts {
  driveMinutes: number;
  driveDistanceM: number;
  firstStartMinute: number | null;
  lastEndMinute: number | null;
}

/**
 * 时间线占用法：每一分钟归给盖住它的块里有效层最高的那些块，一样高的各算各的。
 * 在绝对时间上算；返回每个定时块实际占到的分钟数（整笔归开始那天由调用方按 start_base_id 归）。
 */
export function occupiedMinutes(
  plan: PlanView,
  library: LibraryView,
  filter?: StatsFilter,
): ReadonlyMap<string, number> {
  const bases = new Map(plan.bases.map((base) => [base.id, base]));
  const spans: Array<{ id: string; start: number; end: number; layer: number }> = [];
  for (const block of filteredBlocks(plan, filter)) {
    const base = bases.get(block.start_base_id);
    const interval = base ? blockInterval(block, base) : null;
    if (interval) spans.push({ id: block.id, ...interval, layer: effectiveLayer(block, library) });
  }

  const minutes = new Map<string, number>(spans.map((span) => [span.id, 0]));
  const edges = [...new Set(spans.flatMap((span) => [span.start, span.end]))].sort((a, b) => a - b);
  for (let index = 0; index + 1 < edges.length; index++) {
    const from = edges[index] as number;
    const to = edges[index + 1] as number;
    const covering = spans.filter((span) => span.start <= from && span.end >= to);
    if (covering.length === 0) continue;
    const topLayer = Math.max(...covering.map((span) => span.layer));
    for (const span of covering) {
      if (span.layer === topLayer) minutes.set(span.id, (minutes.get(span.id) ?? 0) + (to - from) / MS_PER_MINUTE);
    }
  }
  return minutes;
}

/** 按类型把实际占到的分钟加起来；合计只算进了汇总的类型，0 分钟的类型不出现。 */
export function timeByKind(
  plan: PlanView,
  library: LibraryView,
  options: TimeByKindOptions = {},
): { minutes: ReadonlyMap<string, number>; total: number } {
  const minutes = new Map<string, number>();
  let total = 0;
  for (const [blockId, occupied] of occupiedMinutes(plan, library, options.filter)) {
    const block = plan.blocks.get(blockId) as BlockView;
    if (occupied === 0) continue;
    if (options.baseId !== undefined && block.start_base_id !== options.baseId) continue;
    if (!options.includeBaseLayer && kindLayer(block, library) === 0) continue;
    minutes.set(block.kind.id, (minutes.get(block.kind.id) ?? 0) + occupied);
    total += occupied;
  }
  return { minutes, total };
}

/** 这天未定时块的时长之和；没填时长的跳过。 */
export function unscheduledMinutes(plan: PlanView, baseId: string, filter?: StatsFilter): number {
  let sum = 0;
  for (const block of filteredBlocks(plan, filter)) {
    if (block.start_base_id === baseId && block.start_minute === null) sum += block.duration_min ?? 0;
  }
  return sum;
}

/**
 * 这天排了多久（分钟）：这天开始的、排上时间、时长大于 0 的块盖住的时间段并起来的总长，叠在一起的只算一次；
 * 停留、住宿不算（同几点起收工）。跨午夜的整段算开始那天。
 */
export function busyMinutes(plan: PlanView, baseId: string, filter?: StatsFilter): number {
  const spans: Array<[number, number]> = [];
  for (const block of filteredBlocks(plan, filter)) {
    if (block.start_base_id !== baseId || block.start_minute === null || BACKGROUND_KIND_IDS.has(block.kind.id)) continue;
    const duration = block.duration_min ?? 0;
    if (duration > 0) spans.push([block.start_minute, block.start_minute + duration]);
  }
  spans.sort((a, b) => a[0] - b[0]);

  let sum = 0;
  let covered = -Infinity;
  for (const [from, to] of spans) {
    if (to <= covered) continue;
    sum += to - Math.max(from, covered);
    covered = to;
  }
  return sum;
}

/**
 * 这天的空档（这天 0 点起的分钟）：这天开始的、排上时间的块按开始时刻从早到晚，记着到这时为止最晚的结束，
 * 下一块开始比它晚至少 minMinutes 分钟就是一段。停留不算（一盖就是一整天、好几天），住宿算；
 * 时长为 0 的块也算一个时刻；第一块之前、最后一块之后不算。不看筛选：筛掉的块那段时间并不空。
 */
export function freeGaps(plan: PlanView, baseId: string, minMinutes: number): Array<{ from: number; to: number }> {
  const spans: Array<[number, number]> = [];
  for (const block of plan.blocks.values()) {
    if (block.start_base_id !== baseId || block.start_minute === null || block.kind.id === "stay") continue;
    spans.push([block.start_minute, block.start_minute + (block.duration_min ?? 0)]);
  }
  spans.sort((a, b) => a[0] - b[0]);

  const gaps: Array<{ from: number; to: number }> = [];
  let covered: number | null = null;
  for (const [from, to] of spans) {
    if (covered !== null && from - covered >= minMinutes) gaps.push({ from: covered, to: from });
    covered = covered === null ? to : Math.max(covered, to);
  }
  return gaps;
}

/** 这天的实际情况：自驾时长和距离、几点起和几点收工、生效的时间预算。 */
export function dayFacts(plan: PlanView, baseId: string, filter?: StatsFilter): DayFacts {
  let driveMinutes = 0;
  let driveDistanceM = 0;
  let firstStartMinute: number | null = null;
  let lastEndMinute: number | null = null;

  for (const block of filteredBlocks(plan, filter)) {
    if (block.start_base_id !== baseId) continue;
    if (block.transport_mode === "drive") {
      driveMinutes += block.duration_min ?? 0;
      driveDistanceM += block.distance_m ?? 0;
    }
    if (block.start_minute === null || BACKGROUND_KIND_IDS.has(block.kind.id)) continue;
    const end = block.start_minute + (block.duration_min ?? 0);
    firstStartMinute = firstStartMinute === null ? block.start_minute : Math.min(firstStartMinute, block.start_minute);
    lastEndMinute = lastEndMinute === null ? end : Math.max(lastEndMinute, end);
  }

  return {
    driveMinutes,
    driveDistanceM,
    firstStartMinute,
    lastEndMinute,
  };
}

