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
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type * as Y from "yjs";
import { blockTimeLabel, slotLabel } from "./block-time";
import {
  clampLinear,
  clampToDay,
  dragResult,
  edgeScrollStep,
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
/** 按下后移动多少像素才算开始拖（也是「挪过」的门槛）；端点多宽；横条至少多宽才有端点（像素） */
const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 6;
const MIN_EDGE_BAR_PX = 24;
/** 手指、笔要按住多久才拿起来（毫秒）；拿起来之前挪了多远就算在滚动、不拿了（像素） */
const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP_PX = 10;
/** 手指拖完以后多久之内的点击都拦下（毫秒）：浏览器给手指补发的点击可能晚几拍才到 */
const TOUCH_CLICK_GUARD_MS = 500;
/** 手指抬起后多久恢复页面选字（毫秒）：iOS 可能在抬起之后才开始选字 */
const RESTORE_SELECT_MS = 300;
// 页面只有一个根元素，恢复选字的计时也只留一个、放在所有时间轴外面：切视图卸掉的时间轴留下的计时，
// 不能在新装上的时间轴按住时把选字恢复了
let restoreSelectTimer: number | undefined;

/** 指针在一行的横轴上，还是在某一行右边的「没排时间」栏里。 */
type Zone = { kind: "axis" } | { kind: "tray"; row: number };

/** 按住一段横条或栏里一件以后的状态：鼠标过了 4 像素的门槛、手指按满 0.5 秒才算在拖；放弃了的留到松手再清掉。 */
interface Drag {
  /** 按住的是横条，还是「没排时间」栏里的一件（只能挪） */
  source: "segment" | "chip";
  blockId: string;
  mode: DragMode;
  /** 栏里的一件在第几行的栏里；横条是 null */
  homeRow: number | null;
  /** 按下的是哪个指针；不是鼠标的（手指、笔）要先长按 */
  pointerId: number;
  touch: boolean;
  downX: number;
  downY: number;
  down: PointerSpot;
  /** 横条：按下时块的开始（线性分钟）和时长；栏里的一件：只用时长 */
  span: Span;
  active: boolean;
  cancelled: boolean;
  /** 离按下的点挪过 4 像素，或者框自己滚过。没挪过就松手不写：手指拿起来以后抖一两个像素，不在 15 分钟格子上的开始不该被吸附 */
  moved: boolean;
  now: PointerSpot;
  /** 最后一次指针在屏幕上的位置：框自己滚时用它重算落点，也用来摆松手后的时间 */
  lastX: number;
  lastY: number;
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

/** 松手后的时间写在指针上方时：写什么、指针在屏幕上哪。 */
export interface PointerLabel {
  text: string;
  x: number;
  y: number;
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
  /** 竖排正在看第几行；横排是 null */
  day: number | null;
  /** 竖排能上下滚的框：拖到框边时它自己滚；横排不给 */
  scroller?: RefObject<HTMLDivElement | null>;
}

export interface TimelineDrag {
  dragView: DragView | null;
  preview: Preview | null;
  trayDrop: TrayDrop | null;
  /** 松手后的时间写在指针上方（手指拖、竖排拖）；鼠标在横排上拖时是 null，时间写在预览框里 */
  pointerLabel: PointerLabel | null;
  handlers: SegmentHandlers;
  chipHandlers: ChipHandlers;
  /** 第 index 行的整行元素、横轴元素、「没排时间」栏：换算指针位置用 */
  rowRef: (index: number) => (element: HTMLLIElement | null) => void;
  axisRef: (index: number) => (element: HTMLDivElement | null) => void;
  trayRef: (index: number) => (element: HTMLDivElement | null) => void;
  /** 时间轴最外层的元素：挂触摸和系统菜单的监听 */
  containerRef: (element: HTMLElement | null) => void;
}

/**
 * 时间轴上拖，横排、竖排共用：
 * - 横条、竖条：中间挪时间，按住 Alt 复制；横排上下拖换天、用鼠标拖两端改长度、拖进「没排时间」栏就变回没排时间
 * - 横排栏里的一件：拖到横轴上排上时间，拖进另一天的栏换天
 * - 竖排不换天（开始夹在块开始的那天），拖到框边时框自己滚
 * - 鼠标按下挪 4 像素开始拖；手指、笔要先按住 0.5 秒拿起来，拿起来之前挪动是滚动
 * 松手才写进计划，一次拖拽一步撤销。按下后在窗口上听移动、松手、Esc：不做指针捕获，否则松手会被改到外框上，点一下就打不开详情。
 */
export function useTimelineDrag({
  doc,
  library,
  plan,
  libraryView,
  rows,
  filter,
  day,
  scroller,
}: TimelineDragOptions): TimelineDrag {
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const longPress = useRef<number | undefined>(undefined);
  const update = (next: Drag | null) => {
    const previous = dragRef.current;
    dragRef.current = next;
    setDrag(next);
    // 松手、放弃、拿起来以后，长按的计时就没用了
    if (next === null || next.active) window.clearTimeout(longPress.current);
    // 手指按住时整个页面暂时不能选字：iOS 长按会选中旁边的字，只给被按的元素设不够；按住结束后过一会儿恢复
    const root = document.documentElement.style;
    if (next?.touch && !previous) {
      window.clearTimeout(restoreSelectTimer);
      root.setProperty("-webkit-user-select", "none");
      root.setProperty("user-select", "none");
    } else if (!next && previous?.touch) {
      restoreSelectTimer = window.setTimeout(() => {
        root.removeProperty("-webkit-user-select");
        root.removeProperty("user-select");
      }, RESTORE_SELECT_MS);
    }
  };
  // 卸载时（比如转屏换成另一种排法）按住的手指不会再抬起：停掉长按计时、恢复页面选字
  useEffect(
    () => () => {
      if (dragRef.current) update(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const rowElements = useRef<Array<HTMLLIElement | null>>([]);
  const axisElements = useRef<Array<HTMLDivElement | null>>([]);
  const trayElements = useRef<Array<HTMLDivElement | null>>([]);
  const suppressClick = useRef(false);
  /** 拿起来拖过的手指刚抬起：接着的 touchend 拦下，浏览器就不补发点击 */
  const swallowTouchEnd = useRef(false);
  /** 最近一次在时间轴里按下的是不是鼠标：手指长按弹出的系统菜单要拦，鼠标右键的不拦 */
  const lastPressByMouse = useRef(true);
  // 窗口上的监听、长按计时、每帧的滚动都经过这里读最新的计划
  const latest = useRef({ doc, library, plan, libraryView, day });
  useEffect(() => {
    latest.current = { doc, library, plan, libraryView, day };
  });

  /**
   * 指针落在第几行、这一行第几分钟（不夹在 0–1440 里）。
   * 横排：纵坐标找行（第一行上面算第一行，最后一行下面算最后一行），横坐标算分钟；竖排：行就是正在看的那一行，纵坐标算分钟。
   */
  const spotAt = (clientX: number, clientY: number): PointerSpot => {
    const { plan, day } = latest.current;
    if (day !== null) {
      const axis = axisElements.current[day]!.getBoundingClientRect();
      return { row: day, minute: ((clientY - axis.top) / axis.height) * MINUTES_PER_DAY };
    }
    const elements = rowElements.current.slice(0, plan.bases.length);
    let row = elements.findIndex((element) => element !== null && clientY < element.getBoundingClientRect().bottom);
    if (row === -1) row = elements.length - 1;
    const axis = axisElements.current[row]!.getBoundingClientRect();
    return { row, minute: ((clientX - axis.left) / axis.width) * MINUTES_PER_DAY };
  };

  /** 横排：横坐标到了这一行「没排时间」栏的左边界及以右，就是在栏里。竖排没有栏。 */
  const zoneAt = (clientX: number, row: number): Zone =>
    latest.current.day === null && clientX >= trayElements.current[row]!.getBoundingClientRect().left
      ? { kind: "tray", row }
      : { kind: "axis" };

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

  /** 指针到了 (clientX, clientY)：重算落点、跟着走的块、会叠上去的块。 */
  const moveTo = (current: Drag, clientX: number, clientY: number, alt: boolean, moved: boolean) => {
    const { plan, libraryView } = latest.current;
    const now = spotAt(clientX, clientY);
    // 改长度不会进栏
    const zone = current.mode === "move" ? zoneAt(clientX, now.row) : { kind: "axis" as const };
    const followers =
      current.source !== "segment" || current.mode !== "move"
        ? []
        : current.active
          ? current.followers
          : followersOf(plan, libraryView, current.blockId);
    update({
      ...current,
      active: true,
      moved,
      now,
      zone,
      alt,
      lastX: clientX,
      lastY: clientY,
      followers,
      ontoId:
        current.mode === "move" && zone.kind === "axis" ? dropTargetAt(clientX, clientY, current.blockId, followers) : null,
    });
  };

  /** 手指按满 0.5 秒：拿起来，指针还在按下的地方。 */
  const lift = () => {
    const current = dragRef.current;
    if (!current || current.active) return;
    moveTo(current, current.downX, current.downY, false, false);
  };

  const pressed = drag !== null;
  useEffect(() => {
    if (!pressed) return;

    const onMove = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || current.cancelled || event.pointerId !== current.pointerId) return;
      const distance = Math.hypot(event.clientX - current.downX, event.clientY - current.downY);
      if (!current.active) {
        // 手指长按之前挪远了：是在滚动，交给浏览器
        if (current.touch) {
          if (distance >= LONG_PRESS_SLOP_PX) update(null);
          return;
        }
        if (distance < DRAG_THRESHOLD_PX) return;
      }
      moveTo(current, event.clientX, event.clientY, event.altKey, current.moved || distance >= DRAG_THRESHOLD_PX);
    };

    const onUp = (event: PointerEvent) => {
      const current = dragRef.current;
      if (!current || event.pointerId !== current.pointerId) return;
      update(null);
      if (!current.active && !current.cancelled) return;
      // 拦下接着的那次点击：鼠标的点击和松手在同一个任务里送到，这一轮拦下、下一轮就不拦；手指的可能晚几拍，多拦一会儿
      suppressClick.current = true;
      setTimeout(
        () => {
          suppressClick.current = false;
        },
        current.touch ? TOUCH_CLICK_GUARD_MS : 0,
      );
      if (current.touch) swallowTouchEnd.current = true;
      if (!current.cancelled && current.moved) commit({ ...current, alt: event.altKey });
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

    // 浏览器取消了这个指针（开始滚动、系统手势）、窗口失去焦点：松手不会再来了
    const onCancel = (event: PointerEvent) => {
      if (event.pointerId === dragRef.current?.pointerId) update(null);
    };
    const abandon = () => update(null);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("blur", abandon);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("blur", abandon);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    // 只在按下、松手时挂和摘；里面的函数都经过 ref 读最新的值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pressed]);

  // 竖排拖动中每帧看一次：指针到了框边，框自己往那边滚，再用最后的指针位置重算落点（手指没动，底下的画布挪了）
  const edgeScrolling = day !== null && drag !== null && drag.active && !drag.cancelled;
  useEffect(() => {
    if (!edgeScrolling) return;
    let frame = requestAnimationFrame(function step() {
      const current = dragRef.current;
      const box = scroller?.current;
      if (current?.active && !current.cancelled && box) {
        const rect = box.getBoundingClientRect();
        const delta = edgeScrollStep(current.lastY, Math.max(rect.top, 0), Math.min(rect.bottom, window.innerHeight));
        const before = box.scrollTop;
        if (delta !== 0) box.scrollTop = before + delta;
        // 滚到头 scrollTop 不再变，就不重算
        if (box.scrollTop !== before) moveTo(current, current.lastX, current.lastY, current.alt, true);
      }
      frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
    // 只在开始拖、停止拖时挂和摘；里面经过 ref 读最新的值
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edgeScrolling]);

  // 时间轴外层的触摸、系统菜单监听。挂载时就挂上：浏览器在手指按下那一刻决定滚动要不要等页面处理，按下以后才挂的拦不住滚动；
  // 非被动（passive: false）才能 preventDefault
  const detachContainer = useRef<(() => void) | null>(null);
  const containerRef = useCallback((element: HTMLElement | null) => {
    detachContainer.current?.();
    detachContainer.current = null;
    if (!element) return;
    const onPointerDown = (event: PointerEvent) => {
      lastPressByMouse.current = event.pointerType === "mouse";
      // 新的一次按下：上一次拖完要拦的 touchend、点击早该到了（没到是按着的元素被换掉了），别拦到这一次
      swallowTouchEnd.current = false;
      suppressClick.current = false;
    };
    // 拿起来以后手指挪动不滚页面、不滚框
    const onTouchMove = (event: TouchEvent) => {
      const current = dragRef.current;
      if (current?.touch && current.active) event.preventDefault();
    };
    const onTouchEnd = (event: TouchEvent) => {
      if (!swallowTouchEnd.current) return;
      swallowTouchEnd.current = false;
      event.preventDefault();
    };
    // 手指按住时不弹系统的长按菜单；鼠标右键照常
    const onContextMenu = (event: MouseEvent) => {
      if (!lastPressByMouse.current) event.preventDefault();
    };
    element.addEventListener("pointerdown", onPointerDown, true);
    element.addEventListener("touchmove", onTouchMove, { passive: false });
    element.addEventListener("touchend", onTouchEnd, { passive: false });
    element.addEventListener("contextmenu", onContextMenu);
    detachContainer.current = () => {
      element.removeEventListener("pointerdown", onPointerDown, true);
      element.removeEventListener("touchmove", onTouchMove);
      element.removeEventListener("touchend", onTouchEnd);
      element.removeEventListener("contextmenu", onContextMenu);
    };
  }, []);

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
    const { doc, library, plan, libraryView, day } = latest.current;
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
    const start = clampStart(result.start, done, rowCount, day);

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
    if (start === clampStart(done.span.start, done, rowCount, day) && layerAfter === block.layer) return;
    moveBlock(doc, library, block.id, target);
  };

  const suppressClickAfterDrag = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.stopPropagation();
    event.preventDefault();
  };

  /** 按下：记下按在哪；鼠标挪 4 像素才开始拖，手指、笔开始长按计时。 */
  const startPress = (
    event: ReactPointerEvent<HTMLDivElement>,
    fields: Pick<Drag, "source" | "blockId" | "mode" | "homeRow" | "span" | "zone">,
  ) => {
    const touch = event.pointerType !== "mouse";
    const down = spotAt(event.clientX, event.clientY);
    update({
      ...fields,
      pointerId: event.pointerId,
      touch,
      downX: event.clientX,
      downY: event.clientY,
      down,
      active: false,
      cancelled: false,
      moved: false,
      now: down,
      lastX: event.clientX,
      lastY: event.clientY,
      alt: event.altKey,
      ontoId: null,
      followers: [],
    });
    if (touch) longPress.current = window.setTimeout(lift, LONG_PRESS_MS);
  };

  const handlers: SegmentHandlers = {
    onPointerDown: (event, item) => {
      // 鼠标只认左键
      if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      const block = plan.blocks.get(item.blockId)!;
      const startRow = plan.bases.findIndex((base) => base.id === block.start_base_id);
      startPress(event, {
        source: "segment",
        blockId: item.blockId,
        // 手指按不准端点，竖排没有端点：都是挪
        mode:
          event.pointerType === "mouse" && day === null
            ? edgeAt(event.currentTarget.getBoundingClientRect(), event.clientX, item)
            : "move",
        homeRow: null,
        span: { start: startRow * MINUTES_PER_DAY + block.start_minute!, duration: block.duration_min ?? 0 },
        zone: { kind: "axis" },
      });
    },
    // 横排上鼠标停在端点上时换成左右箭头
    onPointerMove: (event, item) => {
      if (dragRef.current || event.pointerType !== "mouse" || day !== null) return;
      const frame = event.currentTarget;
      const edge = edgeAt(frame.getBoundingClientRect(), event.clientX, item);
      if (edge === "move") delete frame.dataset.edge;
      else frame.dataset.edge = edge;
    },
    onClickCapture: suppressClickAfterDrag,
  };

  const chipHandlers: ChipHandlers = {
    onPointerDown: (event, blockId, row) => {
      if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      const block = plan.blocks.get(blockId)!;
      startPress(event, {
        source: "chip",
        blockId,
        mode: "move",
        homeRow: row,
        span: { start: 0, duration: block.duration_min ?? DEFAULT_DURATION_MIN },
        zone: { kind: "tray", row },
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
  const preview = live && onAxis ? previewOf(live, plan, libraryView, rows, day) : null;

  return {
    dragView,
    preview,
    trayDrop: live ? trayDropOf(live, plan) : null,
    // 手指按着的地方看不见，竖排的预览框可能滚出框外：时间写在指针上方
    pointerLabel:
      live && preview && (live.touch || day !== null) ? { text: preview.label, x: live.lastX, y: live.lastY } : null,
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
    containerRef,
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

/** 松手后的开始时刻夹在哪：横排夹在计划里，竖排夹在块开始的那天（不换天）。 */
function clampStart(value: number, drag: Drag, rowCount: number, day: number | null): number {
  return day === null ? clampLinear(value, rowCount) : clampToDay(value, Math.floor(drag.span.start / MINUTES_PER_DAY));
}

/** 横轴上的预览框：松手后的时间段，每行一段；框里写开始和结束，复制时前面加「复制 · 」。块已经不在了就没有预览。 */
function previewOf(
  drag: Drag,
  plan: PlanView,
  libraryView: LibraryView,
  rows: readonly RowLayout[],
  day: number | null,
): Preview | null {
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
  // 手指拿起来还没挪：还在原来的时间，不在 15 分钟格子上的开始也不吸附
  const result = drag.moved ? dragResult(drag.mode, drag.down, drag.now, drag.span) : drag.span;
  const start = clampStart(result.start, drag, rowCount, day);
  const first = splitLinear(start);
  const time = blockTimeLabel({ start_minute: first.minute, duration_min: result.duration, slot: null }, plan.bases[first.row]!.date);
  return {
    pieces: previewSegments(start, result.duration, rowCount),
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
