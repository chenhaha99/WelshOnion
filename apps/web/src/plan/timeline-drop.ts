import {
  kindLayer,
  previewDrop,
  previewSetBlockTimed,
  type BlockView,
  type LibraryView,
  type Placement,
  type PlanView,
  type SlotChoice,
  type StatsFilter,
} from "@welshonion/core";
import {
  clampLinear,
  clampToDay,
  dragResult,
  slotOfMinute,
  splitLinear,
  undatedStartMinute,
  type DragMode,
  type PointerSpot,
  type Span,
} from "./timeline-drag";
import { daySegmentPixels, MARKER_HIT, wideSegmentBox } from "./timeline-geometry";
import { layoutRow, timelineSegments, type PlacedSegment, type RowLayout } from "./timeline-layout";

/*
 * 时间轴上拖拽松手后的事：松手调哪个操作、带什么参数（松手写入和拖动中画的样子共用这一份），
 * 松手后的计划和行怎么画，指针落在哪块的中间（叠上去还是放旁边）。不碰 DOM：屏幕上的位置由调用方量好传进来。
 */

const MINUTES_PER_DAY = 1440;
/** 没填时长的事拖上时间轴给多长（分钟），和安排表「排上时间」的默认一样 */
const DEFAULT_DURATION_MIN = 60;
/** 落在一块的这一段（横排从上往下、竖排从左往右）算中间，叠上去；两边放旁边 */
/** 块的上下边（竖排左右边）各留这么多算「边上」：横排按道高的比例，竖排按这一段自己的宽度 */
const EDGE_RATIO = 0.3;

/** 算松手后的事要用的拖拽状态。 */
export interface DropInput {
  /** 按住的是横条，还是「没排时间」栏里的一件（只能挪） */
  source: "segment" | "chip";
  blockId: string;
  mode: DragMode;
  alt: boolean;
  /** 这一次是从快捷条的「复制」按住拖出来的：拖的是复制出来的那一份，进「没排时间」栏也是复制 */
  forceCopy: boolean;
  /** 指针在横轴上，还是在某一行的「没排时间」栏里 */
  zone: { kind: "axis" } | { kind: "tray" };
  /** 栏里的一件在第几行的栏里；横条是 null */
  down: PointerSpot;
  now: PointerSpot;
  /** 横条：按下时块的开始（线性分钟）和时长；栏里的一件：只用时长 */
  span: Span;
  /** 挪过没有：手指拿起来没挪就还在原来的时间，不吸附 */
  moved: boolean;
  /** 松手会叠上去的块；null 是放旁边 */
  ontoId: string | null;
}

/** 松手调哪个操作、带什么参数。挪和改开始的分钟是从第一天 0 点起的线性分钟，底座给第一天，由 core 换算。 */
export type DropAction =
  | { kind: "move"; blockId: string; copy: boolean; baseId: string; minute: number; ontoId: string | null }
  | { kind: "timed"; blockId: string; baseId: string; minute: number; duration: number; ontoId: string | null }
  | { kind: "resize-start"; blockId: string; baseId: string; minute: number; duration: number }
  | { kind: "resize-end"; blockId: string; duration: number }
  | { kind: "undated"; blockId: string; copy: boolean; baseId: string; slot: SlotChoice };

/** 叠上去还是放旁边，写成操作的放法。 */
export function placementOf(ontoId: string | null): { placement: Placement; ontoBlockId?: string } {
  return ontoId === null ? { placement: "beside" } : { placement: "onto", ontoBlockId: ontoId };
}

/**
 * 松手会做什么：块没了、栏里的一件拖回原来的栏、块已经不是拖的时候的样子（别的标签页刚改了），是 null。
 * 开始时刻横排夹在计划里，竖排（day 是正在看的那一行）夹在块开始的那天。
 */
export function dropAction(input: DropInput, plan: PlanView, day: number | null): DropAction | null {
  const block = plan.blocks.get(input.blockId);
  if (!block) return null;
  const blockId = block.id;

  if (input.zone.kind === "tray") {
    // 条里的拖回条里：不改（只有一条，没有「换到另一天的栏」这回事了）
    if (input.source === "chip" || block.start_minute === null) return null;
    // 拖进条里都是挪（按着 Alt 也是）；只有从快捷条的「复制」拖出来的，进条的是复制出来的那一份。
    // 留在它原来那一天：条是整个计划共用的，没有「拖进了哪一天」
    return {
      kind: "undated",
      blockId,
      copy: input.forceCopy,
      baseId: block.start_base_id,
      slot: slotOfMinute(block.start_minute),
    };
  }

  if (input.source === "chip") {
    if (block.start_minute !== null) return null;
    return {
      kind: "timed",
      blockId,
      baseId: plan.bases[input.now.row]!.id,
      minute: undatedStartMinute(input.now.minute),
      duration: block.duration_min ?? DEFAULT_DURATION_MIN,
      ontoId: input.ontoId,
    };
  }

  if (block.start_minute === null) return null;
  const origin = plan.bases[0]!.id;
  const result = input.moved ? dragResult(input.mode, input.down, input.now, input.span) : input.span;
  const start = clampStart(result.start, input.span, plan.bases.length, day);
  if (input.mode === "end") return { kind: "resize-end", blockId, duration: result.duration };
  if (input.mode === "start") {
    // 结束不动：夹过开始时，时长跟着按结束算
    return { kind: "resize-start", blockId, baseId: origin, minute: start, duration: input.span.start + input.span.duration - start };
  }
  return { kind: "move", blockId, copy: input.alt, baseId: origin, minute: start, ontoId: input.ontoId };
}

/** 松手后的开始时刻夹在哪：横排夹在计划里，竖排夹在块开始的那天（不换天）。 */
export function clampStart(value: number, span: Span, rowCount: number, day: number | null): number {
  return day === null ? clampLinear(value, rowCount) : clampToDay(value, Math.floor(span.start / MINUTES_PER_DAY));
}

/**
 * 松手后的计划，用和松手写入同一套算法：挪、复制用 core 的 previewDrop，排上时间用 previewSetBlockTimed，
 * 改长度只改这一块的开始和时长。拖进栏里时时间轴不重排，是 null；块已经不在了也是 null。
 */
export function droppedPlan(plan: PlanView, library: LibraryView, action: DropAction): PlanView | null {
  switch (action.kind) {
    case "undated":
      return null;
    case "timed": {
      const { baseId, minute, duration } = action;
      const result = previewSetBlockTimed(plan, library, action.blockId, {
        baseId,
        minute,
        duration,
        ...placementOf(action.ontoId),
      });
      return result.ok ? result.value : null;
    }
    case "move": {
      const target = { baseId: action.baseId, minute: action.minute, ...placementOf(action.ontoId) };
      const result = previewDrop(plan, library, action.blockId, target, { copy: action.copy });
      return result.ok ? result.value : null;
    }
    case "resize-end":
      return withBlock(plan, action.blockId, { duration_min: action.duration });
    case "resize-start": {
      const start = splitLinear(action.minute);
      return withBlock(plan, action.blockId, {
        start_base_id: plan.bases[start.row]!.id,
        start_minute: start.minute,
        duration_min: action.duration,
      });
    }
  }
}

function withBlock(plan: PlanView, blockId: string, patch: Partial<BlockView>): PlanView | null {
  const block = plan.blocks.get(blockId);
  return block ? { ...plan, blocks: new Map(plan.blocks).set(blockId, { ...block, ...patch }) } : null;
}

/**
 * 拖动中画的每一行：松手后的计划按画时间轴的同一套摆好。
 * keepHeights（横排）时每行的道数、背景条数不比拖之前少：块离开的那一行不变矮，指针下面不会换成下一行。
 */
export function droppedRows(
  plan: PlanView,
  library: LibraryView,
  filter: StatsFilter | undefined,
  before: readonly RowLayout[],
  keepHeights: boolean,
): RowLayout[] {
  const segments = timelineSegments(plan, filter);
  return plan.bases.map((_, row) =>
    shownRow(
      layoutRow(
        segments.filter((segment) => segment.row === row),
        plan,
        library,
      ),
      keepHeights ? before[row]! : null,
    ),
  );
}

/** 只摆一行，同 droppedRows 里的那一行：拖动中判定叠上去还是放旁边时用。before 给了就不比它矮。 */
export function droppedRow(
  plan: PlanView,
  library: LibraryView,
  filter: StatsFilter | undefined,
  row: number,
  before: RowLayout | null,
): RowLayout {
  const segments = timelineSegments(plan, filter).filter((segment) => segment.row === row);
  return shownRow(layoutRow(segments, plan, library), before);
}

function shownRow(layout: RowLayout, before: RowLayout | null): RowLayout {
  if (!before) return layout;
  return {
    ...layout,
    laneCount: Math.max(layout.laneCount, before.laneCount),
    backgroundCount: Math.max(layout.backgroundCount, before.backgroundCount),
    // 道高也不比拖之前矮：套进去、拿出来时道高会变（套在里面的往下让一行），拖动中变来变去，指针底下的落点会跳
    laneDepths: Array.from({ length: Math.max(layout.laneCount, before.laneCount) }, (_, index) =>
      Math.max(layout.laneDepths[index] ?? 0, before.laneDepths[index] ?? 0),
    ),
  };
}

export interface Point {
  x: number;
  y: number;
}

export interface AxisRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 判定指针落在哪块上要的东西。 */
export interface HitContext {
  plan: PlanView;
  library: LibraryView;
  /** 指针所在那一行（竖排是正在看的那一天）画着的样子 */
  layout: RowLayout;
  /** 这一行的横轴在屏幕上的位置 */
  axis: AxisRect;
  orientation: "wide" | "day";
  /** 横排主轨每道多高（像素）：块上写不写开销不一样 */
  laneHeight: number;
  /** 不算的块：被拖的块、跟着它走的块，复制时还有复制出来的 */
  excluded: ReadonlySet<string>;
  /** 被拖块的类型层：只看类型层一样的块 */
  kindLayer: number;
}

/**
 * 指针落在哪块的中间就叠到哪块上，返回那块的 id；落在它的边上、没落在类型层一样的块上，是 null（放旁边）。
 * 几块叠着时从画在最上面的看起（缩得深的在上，一样深的后画的在上），类型层不一样的跳过、接着往下看。
 *
 * 横排的「边」按**道高**量（0.3 道高，28 像素的道约 8 像素），不按这一段自己的高度量：
 * 一叠进去，那一道就高出一行字，这一段跟着变高；按自己的高度量的话，刚够叠上去的那个点，
 * 叠上去以后又不够了（decideOnto 第二步不认），得对准 4 像素的窄缝才叠得进去。
 * 竖排的列宽不随叠放变，还是按这一段自己的宽度取两边各 30%。
 */
export function ontoAt(point: Point, context: HitContext): string | null {
  const { plan, library, layout, axis, orientation, excluded, laneHeight } = context;
  const under = [...layout.background, ...layout.main]
    .map((item, order) => ({ item, order, rect: segmentRect(item, layout, axis, orientation, laneHeight) }))
    .filter(({ item, rect }) => !excluded.has(item.blockId) && inside(point, rect))
    .sort((a, b) => b.item.depth - a.item.depth || b.order - a.order);
  for (const { item, rect } of under) {
    if (kindLayer(plan.blocks.get(item.blockId)!, library) !== context.kindLayer) continue;
    if (orientation === "wide") {
      const edge = EDGE_RATIO * laneHeight;
      const middle = point.y >= rect.top + edge && point.y <= rect.top + rect.height - edge;
      return middle ? item.blockId : null;
    }
    const share = (point.x - rect.left) / rect.width;
    return share >= EDGE_RATIO && share <= 1 - EDGE_RATIO ? item.blockId : null;
  }
  return null;
}

/** 一段在屏幕上占的矩形，和 Timeline、DayTimeline 画的一样（timeline-geometry）；时长为 0 的沿时间方向放宽到 12 像素。 */
function segmentRect(
  item: PlacedSegment,
  layout: RowLayout,
  axis: AxisRect,
  orientation: "wide" | "day",
  laneHeight: number,
): AxisRect {
  const along = orientation === "wide" ? axis.width : axis.height;
  const start = (item.from / MINUTES_PER_DAY) * along;
  const length = ((item.to - item.from) / MINUTES_PER_DAY) * along;
  const [from, size] = length === 0 ? [start - MARKER_HIT / 2, MARKER_HIT] : [start, length];
  if (orientation === "wide") {
    const { top, height } = wideSegmentBox(item, layout, laneHeight);
    return { left: axis.left + from, width: size, top: axis.top + top, height };
  }
  const { left, width } = daySegmentPixels(item, layout, axis.width);
  return { left: axis.left + left, width, top: axis.top + from, height: size };
}

function inside(point: Point, rect: AxisRect): boolean {
  return (
    point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height
  );
}

/**
 * 叠上去还是放旁边：先按正画着的样子（照现在的判定画的）看指针落在哪，和现在的一样就不变；
 * 不一样时，再按换过去以后的样子看一次，还是它才换，不是就保持现在的——不然那块一换道，指针下面就换了，每挪一下来回跳。
 * hitWith(ontoId)：照 ontoId 画出来时，指针落在哪块的中间。
 */
export function decideOnto(current: string | null, hitWith: (ontoId: string | null) => string | null): string | null {
  const hit = hitWith(current);
  if (hit === current) return current;
  return hitWith(hit) === hit ? hit : current;
}
