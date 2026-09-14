import {
  duplicateBlock,
  followersOf,
  kindLayer,
  layerWhenOnto,
  moveBlock,
  passesFilter,
  resizeBlock,
  resizeBlockStart,
  setBlockTimed,
  setBlockUndated,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import type * as Y from "yjs";
import { blockTimeLabel, slotLabel } from "./block-time";
import {
  clampLinear,
  dragResult,
  previewSegments,
  slotOfMinute,
  splitLinear,
  undatedStartMinute,
  type DragMode,
  type PointerSpot,
  type Span,
} from "./timeline-drag";
import type { PlacedSegment, RowLayout } from "./timeline-layout";

const MINUTES_PER_DAY = 1440;
/** 没填时长的事拖上时间轴给多长（分钟），和安排表「排上时间」的默认一样 */
const DEFAULT_DURATION_MIN = 60;
/** 按下后移动多少像素才算开始拖；端点多宽；横条至少多宽才有端点（像素） */
const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 6;
const MIN_EDGE_BAR_PX = 24;

/** 指针在一行的横轴上，还是在某一行右边的「没排时间」栏里。 */
type Zone = { kind: "axis" } | { kind: "tray"; row: number };

/** 按住一段横条或栏里一件以后的状态：过了 4 像素的门槛才算在拖；放弃了的留到松手再清掉。 */
interface Drag {
  /** 按住的是横条，还是「没排时间」栏里的一件（只能挪） */
  source: "segment" | "chip";
  blockId: string;
  mode: DragMode;
  /** 栏里的一件在第几行的栏里；横条是 null */
  homeRow: number | null;
  downX: number;
  downY: number;
  down: PointerSpot;
  /** 横条：按下时块的开始（线性分钟）和时长；栏里的一件：只用时长 */
  span: Span;
  active: boolean;
  cancelled: boolean;
  now: PointerSpot;
  zone: Zone;
  alt: boolean;
  /** 松手会叠上去的块；null 是放旁边 */
  ontoId: string | null;
  followers: readonly string[];
}

/** 拖动中每段横条要画成什么样。 */
export interface DragView {
  blockId: string;
  copying: boolean;
  followers: readonly string[];
  ontoId: string | null;
}

/** 拖动中横轴上的预览框：松手后的时间段，每行一段；框里写开始和结束。 */
export interface Preview {
  pieces: Array<{ row: number; from: number; to: number }>;
  label: string;
  track: PlacedSegment["track"];
}

/** 拖进某一行的「没排时间」栏时：哪一行、会进哪一格。 */
export interface TrayDrop {
  row: number;
  label: string;
}

export interface SegmentHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: PlacedSegment) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, item: PlacedSegment) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

export interface ChipHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string, row: number) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

interface TimelineDragOptions {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  /** 每一行摆好的横条（已经按筛选算过） */
  rows: readonly RowLayout[];
  /** 按状态筛选；没开是 undefined */
  filter: StatsFilter | undefined;
}

export interface TimelineDrag {
  dragView: DragView | null;
  preview: Preview | null;
  trayDrop: TrayDrop | null;
  handlers: SegmentHandlers;
  chipHandlers: ChipHandlers;
  /** 第 index 行的整行元素、横轴元素、「没排时间」栏：换算指针位置用 */
  rowRef: (index: number) => (element: HTMLLIElement | null) => void;
  axisRef: (index: number) => (element: HTMLDivElement | null) => void;
  trayRef: (index: number) => (element: HTMLDivElement | null) => void;
}

/**
 * 时间轴上用鼠标拖：
 * - 横条：中间挪时间或换天，两端改长度，按住 Alt 复制；拖中间拖进「没排时间」栏就变回没排时间
 * - 栏里的一件：拖到横轴上排上时间，拖进另一天的栏换天
 * 松手才写进计划，一次拖拽一步撤销。按下后在窗口上听移动、松手、Esc：不做指针捕获，否则松手会被改到外框上，点一下就打不开详情。
 */
export function useTimelineDrag({ doc, library, plan, libraryView, rows, filter }: TimelineDragOptions): TimelineDrag {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const rowElements = useRef<Array<HTMLLIElement | null>>([]);
  const axisElements = useRef<Array<HTMLDivElement | null>>([]);
  const trayElements = useRef<Array<HTMLDivElement | null>>([]);
  const suppressClick = useRef(false);
  // 窗口上的监听在按下时挂一次，要经过这里读最新的计划
  const latest = useRef({ doc, library, plan, libraryView });
  useEffect(() => {
    latest.current = { doc, library, plan, libraryView };
  });

  /** 指针落在第几行（第一行上面算第一行，最后一行下面算最后一行）、这一行横轴上第几分钟（不夹在 0–1440 里）。 */
  const spotAt = (clientX: number, clientY: number): PointerSpot => {
    const elements = rowElements.current.slice(0, latest.current.plan.bases.length);
    let row = elements.findIndex((element) => element !== null && clientY < element.getBoundingClientRect().bottom);
    if (row === -1) row = elements.length - 1;
    const axis = axisElements.current[row]!.getBoundingClientRect();
    return { row, minute: ((clientX - axis.left) / axis.width) * MINUTES_PER_DAY };
  };

  /** 横坐标到了这一行「没排时间」栏的左边界及以右，就是在栏里。 */
  const zoneAt = (clientX: number, row: number): Zone =>
    clientX >= trayElements.current[row]!.getBoundingClientRect().left ? { kind: "tray", row } : { kind: "axis" };

  // 拖到一半块没了（被撤销、被筛掉、别的标签页删了）：横条或栏里那件没了，松手也收不到，直接清掉
  useEffect(() => {
    const current = dragRef.current;
    if (!current) return;
    const block = plan.blocks.get(current.blockId);
    const gone =
      current.source === "segment"
        ? !rows.some((row) => [...row.background, ...row.main].some((item) => item.blockId === current.blockId))
        : !block || block.start_minute !== null || !passesFilter(block, filter);
    if (gone) update(null);
  }, [rows, plan, filter]);

  const pressed = drag !== null;
  useEffect(() => {
    if (!pressed) return;

    const onMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.cancelled) return;
      if (!current.active && Math.hypot(event.clientX - current.downX, event.clientY - current.downY) < DRAG_THRESHOLD_PX) {
        return;
      }
      const { plan, libraryView } = latest.current;
      const now = spotAt(event.clientX, event.clientY);
      // 改长度不会进栏
      const zone = current.mode === "move" ? zoneAt(event.clientX, now.row) : { kind: "axis" as const };
      const followers =
        current.source !== "segment" || current.mode !== "move"
          ? []
          : current.active
            ? current.followers
            : followersOf(plan, libraryView, current.blockId);
      update({
        ...current,
        active: true,
        now,
        zone,
        alt: event.altKey,
        followers,
        ontoId:
          current.mode === "move" && zone.kind === "axis"
            ? dropTargetAt(event.clientX, event.clientY, current.blockId, followers)
            : null,
      });
    };

    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      update(null);
      if (!current.active && !current.cancelled) return;
      // 松手和接着的那次点击在同一个任务里送到：这一轮拦下点击，下一轮就不拦了
      suppressClick.current = true;
      setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      if (!current.cancelled) commit({ ...current, alt: event.altKey });
    };

    const onKey = (event: KeyboardEvent) => {
      const current = dragRef.current;
      if (!current?.active || current.cancelled) return;
      if (event.key === "Escape") {
        event.preventDefault();
        update({ ...current, cancelled: true });
      } else if (event.key === "Alt") {
        event.preventDefault();
        update({ ...current, alt: event.type === "keydown" });
      }
    };

    // 浏览器取消了指针、窗口失去焦点：松手不会再来了
    const abandon = () => update(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", abandon);
    window.addEventListener("blur", abandon);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", abandon);
      window.removeEventListener("blur", abandon);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // 只在按下、松手时挂和摘；里面的函数都经过 ref 读最新的值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressed]);

  /** 指针下面第一个类型层和被拖块相同的块（不算被拖的块和跟着它走的块）；没有就是放旁边。 */
  const dropTargetAt = (clientX: number, clientY: number, blockId: string, followers: readonly string[]): string | null => {
    const { plan, libraryView } = latest.current;
    const draggedLayer = kindLayer(plan.blocks.get(blockId)!, libraryView);
    for (const element of document.elementsFromPoint(clientX, clientY)) {
      const id = element.closest<HTMLElement>("[data-segment]")?.dataset.blockId;
      if (id === undefined || id === blockId || followers.includes(id)) continue;
      const target = plan.blocks.get(id);
      if (target && kindLayer(target, libraryView) === draggedLayer) return id;
    }
    return null;
  };

  /** 松手：按从哪拖到哪调一个操作（一步撤销）；结果和原来一样就不调。 */
  const commit = (done: Drag) => {
    const { doc, library, plan, libraryView } = latest.current;
    // 松手前别的标签页刚把它删了
    const block = plan.blocks.get(done.blockId);
    if (!block) return;
    const placement =
      done.ontoId === null
        ? { placement: "beside" as const }
        : { placement: "onto" as const, ontoBlockId: done.ontoId };

    if (done.zone.kind === "tray") {
      const baseId = plan.bases[done.zone.row]!.id;
      if (done.source === "chip") {
        // 拖回原来那天的栏：什么都不改
        if (block.start_minute === null && done.zone.row !== done.homeRow) {
          setBlockUndated(doc, block.id, { baseId, slot: block.slot ?? "day" });
        }
      } else if (block.start_minute !== null) {
        setBlockUndated(doc, block.id, { baseId, slot: slotOfMinute(block.start_minute) });
      }
      return;
    }

    if (done.source === "chip") {
      if (block.start_minute !== null) return;
      setBlockTimed(doc, library, block.id, {
        baseId: plan.bases[done.now.row]!.id,
        minute: undatedStartMinute(done.now.minute),
        duration: block.duration_min ?? DEFAULT_DURATION_MIN,
        ...placement,
      });
      return;
    }

    // 松手前别的标签页刚取消了它的时间
    if (block.start_minute === null) return;
    const rowCount = plan.bases.length;
    const origin = plan.bases[0]!.id;
    const result = dragResult(done.mode, done.down, done.now, done.span);
    const start = clampLinear(result.start, rowCount);

    if (done.mode === "end") {
      if (result.duration !== done.span.duration) resizeBlock(doc, block.id, result.duration);
      return;
    }
    if (done.mode === "start") {
      if (start !== done.span.start) resizeBlockStart(doc, block.id, { baseId: origin, minute: start });
      return;
    }

    const target = { baseId: origin, minute: start, ...placement };
    if (done.alt) {
      duplicateBlock(doc, library, block.id, target);
      return;
    }
    const layerAfter = done.ontoId === null ? null : layerWhenOnto(plan, libraryView, block, done.ontoId);
    if (start === clampLinear(done.span.start, rowCount) && layerAfter === block.layer) return;
    moveBlock(doc, library, block.id, target);
  };

  const suppressClickAfterDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.stopPropagation();
    event.preventDefault();
  };

  const handlers: SegmentHandlers = {
    onPointerDown: (event, item) => {
      // 只认鼠标左键：手机上手指滑动还是滚动时间轴
      if (event.pointerType !== "mouse" || event.button !== 0 || dragRef.current) return;
      const block = plan.blocks.get(item.blockId)!;
      const startRow = plan.bases.findIndex((base) => base.id === block.start_base_id);
      const down = spotAt(event.clientX, event.clientY);
      update({
        source: "segment",
        blockId: item.blockId,
        mode: edgeAt(event.currentTarget.getBoundingClientRect(), event.clientX, item),
        homeRow: null,
        downX: event.clientX,
        downY: event.clientY,
        down,
        span: { start: startRow * MINUTES_PER_DAY + block.start_minute!, duration: block.duration_min ?? 0 },
        active: false,
        cancelled: false,
        now: down,
        zone: { kind: "axis" },
        alt: event.altKey,
        ontoId: null,
        followers: [],
      });
    },
    // 指针停在端点上时换成左右箭头
    onPointerMove: (event, item) => {
      if (dragRef.current || event.pointerType !== "mouse") return;
      const frame = event.currentTarget;
      const edge = edgeAt(frame.getBoundingClientRect(), event.clientX, item);
      if (edge === "move") delete frame.dataset.edge;
      else frame.dataset.edge = edge;
    },
    onClickCapture: suppressClickAfterDrag,
  };

  const chipHandlers: ChipHandlers = {
    onPointerDown: (event, blockId, row) => {
      if (event.pointerType !== "mouse" || event.button !== 0 || dragRef.current) return;
      const block = plan.blocks.get(blockId)!;
      const down = spotAt(event.clientX, event.clientY);
      update({
        source: "chip",
        blockId,
        mode: "move",
        homeRow: row,
        downX: event.clientX,
        downY: event.clientY,
        down,
        span: { start: 0, duration: block.duration_min ?? DEFAULT_DURATION_MIN },
        active: false,
        cancelled: false,
        now: down,
        zone: { kind: "tray", row },
        alt: event.altKey,
        ontoId: null,
        followers: [],
      });
    },
    onClickCapture: suppressClickAfterDrag,
  };

  const live = drag?.active && !drag.cancelled ? drag : null;
  const onAxis = live?.zone.kind === "axis";
  const dragView: DragView | null = live
    ? {
        blockId: live.blockId,
        copying: live.source === "segment" && live.mode === "move" && live.alt && onAxis,
        followers: onAxis ? live.followers : [],
        ontoId: live.ontoId,
      }
    : null;

  return {
    dragView,
    preview: live && onAxis ? previewOf(live, plan, libraryView, rows) : null,
    trayDrop: live ? trayDropOf(live, plan) : null,
    handlers,
    chipHandlers,
    rowRef: (index) => (element) => {
      rowElements.current[index] = element;
    },
    axisRef: (index) => (element) => {
      axisElements.current[index] = element;
    },
    trayRef: (index) => (element) => {
      trayElements.current[index] = element;
    },
  };
}

/** 按在横条的哪里：左右各 6 像素是端点（横条至少 24 像素宽才有；接着上一行、下一行的那头没有），其余是挪。 */
function edgeAt(rect: DOMRect, clientX: number, item: PlacedSegment): DragMode {
  if (rect.width < MIN_EDGE_BAR_PX) return "move";
  const offset = clientX - rect.left;
  if (!item.continuesBefore && offset <= EDGE_PX) return "start";
  if (!item.continuesAfter && rect.width - offset <= EDGE_PX) return "end";
  return "move";
}

/** 横轴上的预览框：松手后的时间段，每行一段；框里写开始和结束，复制时前面加「复制 · 」。块已经不在了就没有预览。 */
function previewOf(drag: Drag, plan: PlanView, libraryView: LibraryView, rows: readonly RowLayout[]): Preview | null {
  const rowCount = plan.bases.length;

  if (drag.source === "chip") {
    const block = plan.blocks.get(drag.blockId);
    if (!block) return null;
    const minute = undatedStartMinute(drag.now.minute);
    const topKindLayer = Math.max(...[...libraryView.kinds.values()].map((kind) => kind.layer));
    return {
      pieces: previewSegments(drag.now.row * MINUTES_PER_DAY + minute, drag.span.duration, rowCount),
      label: blockTimeLabel({ start_minute: minute, duration_min: drag.span.duration, slot: null }, plan.bases[drag.now.row]!.date),
      track: kindLayer(block, libraryView) < topKindLayer ? "background" : "main",
    };
  }

  const drawn = rows.flatMap((row) => [...row.background, ...row.main]).find((item) => item.blockId === drag.blockId);
  if (!drawn) return null;
  const result = dragResult(drag.mode, drag.down, drag.now, drag.span);
  const first = splitLinear(clampLinear(result.start, rowCount));
  const time = blockTimeLabel(
    { start_minute: first.minute, duration_min: result.duration, slot: null },
    plan.bases[first.row]!.date,
  );
  return {
    pieces: previewSegments(result.start, result.duration, rowCount),
    label: drag.alt && drag.mode === "move" ? `复制 · ${time}` : time,
    track: drawn.track,
  };
}

/** 拖进栏里时：那一栏描边、写会进哪一格。栏里的一件拖回原来那天的栏不算。 */
function trayDropOf(drag: Drag, plan: PlanView): TrayDrop | null {
  if (drag.zone.kind !== "tray") return null;
  const block = plan.blocks.get(drag.blockId);
  if (!block) return null;
  if (drag.source === "chip") {
    return drag.zone.row === drag.homeRow ? null : { row: drag.zone.row, label: slotLabel(block.slot) };
  }
  if (block.start_minute === null) return null;
  const slot = slotOfMinute(block.start_minute);
  return { row: drag.zone.row, label: slotLabel(slot === "day" ? null : slot) };
}
