import {
  duplicateBlock,
  followersOf,
  kindLayer,
  LOCAL_ORIGIN,
  layerWhenOnto,
  moveBlock,
  passesFilter,
  previewCopyId,
  resizeBlock,
  resizeBlockStart,
  setBlockTimed,
  setBlockUndated,
  type BlockView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import type * as Y from "yjs";
import { blockTimeLabel, slotLabel } from "./block-time";
import { edgeScrollStep, slotOfMinute, type DragMode, type PointerSpot } from "./timeline-drag";
import {
  clampStart,
  decideOnto,
  dropAction,
  droppedPlan,
  droppedRow,
  droppedRows,
  ontoAt,
  placementOf,
  type DropInput,
} from "./timeline-drop";
import type { PlacedSegment, RowLayout } from "./timeline-layout";

const MINUTES_PER_DAY = 1440;
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

/**
 * 按住一段横条或栏里一件以后的状态：鼠标过了 4 像素的门槛、手指按满 0.5 秒才算在拖；放弃了的留到松手再清掉。
 * 算松手后做什么要的那几样见 DropInput；moved 在这里是「离按下的点挪过 4 像素，或者框自己滚过」。
 */
interface Drag extends DropInput {
  /** 按下的是哪个指针；不是鼠标的（手指、笔）要先长按 */
  pointerId: number;
  touch: boolean;
  downX: number;
  downY: number;
  active: boolean;
  cancelled: boolean;
  /** 最后一次指针在屏幕上的位置：框自己滚时用它重算落点，也用来摆松手后的时间 */
  lastX: number;
  lastY: number;
  followers: readonly string[];
}

/** 快捷条上的「复制」：按住拖出来的那一份（点一下不拖是原地复制，由快捷条自己做）。 */
export interface CopyHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>, blockId: string) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  /** 手指已经把复制出来的那一份拿起来了：这时手指挪动不能滚页面（手机上快捷条不在时间轴里面，要它自己拦） */
  liftedByFinger: () => boolean;
}

/** 拖动中每段横条要画成什么样。 */
export interface DragView {
  /** 被拖的块 */
  blockId: string;
  /** 按着 Alt 挪：复制，原来的不动 */
  copying: boolean;
  /** 画在松手后的位置、拿起来的样子的块：挪的是它自己，复制的是复制出来的；指针在栏里时是 null（时间轴不重排） */
  liftedId: string | null;
  /** 跟着一起走的块（复制时是复制出来的那些），画在松手后的位置 */
  followers: readonly string[];
  /** 松手会叠上去的块 */
  ontoId: string | null;
}

/** 拖动中画的样子：松手后的计划和摆好的行。 */
export interface DroppedView {
  plan: PlanView;
  rows: RowLayout[];
}

/** 松手后的时间写在指针上方时：写什么、指针在屏幕上哪。 */
export interface PointerLabel {
  text: string;
  x: number;
  y: number;
}

/** 拖进「没排时间」条时：会进哪一格。 */
export interface TrayDrop {
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
  /** 横排主轨每道多高（像素）：块上写不写开销不一样，量指针落在哪块上要用 */
  laneHeight: number;
  /** 竖排能上下滚的框：拖到框边时它自己滚；横排不给 */
  scroller?: RefObject<HTMLDivElement | null>;
  /** 松手写进计划以后：拖的那一件（复制的是复制出来的那一份）；外面用它接着选中 */
  onDropped?: (blockId: string) => void;
}

export interface TimelineDrag {
  dragView: DragView | null;
  /** 拖动中、指针在时间轴上时，松手后的计划和行：照它画；别的时候是 null，照原来的画 */
  dropped: DroppedView | null;
  trayDrop: TrayDrop | null;
  /** 松手后的时间，写在指针上方；没在时间轴上拖是 null */
  pointerLabel: PointerLabel | null;
  handlers: SegmentHandlers;
  chipHandlers: ChipHandlers;
  copyHandlers: CopyHandlers;
  /** 第 index 行的整行元素、横轴元素、「没排时间」栏：换算指针位置用 */
  rowRef: (index: number) => (element: HTMLLIElement | null) => void;
  axisRef: (index: number) => (element: HTMLDivElement | null) => void;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 时间轴最外层的元素：挂触摸和系统菜单的监听 */
  containerRef: (element: HTMLElement | null) => void;
}

/**
 * 时间轴上拖，横排、竖排共用：
 * - 横条、竖条：中间挪时间，按住 Alt 复制；横排上下拖换天、用鼠标拖两端改长度、拖进「没排时间」栏就变回没排时间
 * - 横排栏里的一件：拖到横轴上排上时间，拖进另一天的栏换天
 * - 竖排不换天（开始夹在块开始的那天），拖到框边时框自己滚
 * - 鼠标按下挪 4 像素开始拖；手指、笔要先按住 0.5 秒拿起来，拿起来之前挪动是滚动
 * 拖动中画成松手后的样子（dropped），叠上去还是放旁边照那个样子判定（timeline-drop）。
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
  laneHeight,
  scroller,
  onDropped,
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
  const trayElement = useRef<HTMLDivElement | null>(null);
  const suppressClick = useRef(false);
  /** 拿起来拖过的手指刚抬起：接着的 touchend 拦下，浏览器就不补发点击 */
  const swallowTouchEnd = useRef(false);
  /** 最近一次在时间轴里按下的是不是鼠标：手指长按弹出的系统菜单要拦，鼠标右键的不拦 */
  const lastPressByMouse = useRef(true);
  // 窗口上的监听、长按计时、每帧的滚动都经过这里读最新的计划
  const latest = useRef({ doc, library, plan, libraryView, rows, filter, day, laneHeight });
  useEffect(() => {
    latest.current = { doc, library, plan, libraryView, rows, filter, day, laneHeight };
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

/** 横排：指针落在时间轴上面那条「没排时间」里就是在条里（条是整个计划一条）。竖排没有条。 */
  const zoneAt = (clientX: number, clientY: number): Drag["zone"] => {
    const tray = latest.current.day === null ? trayElement.current?.getBoundingClientRect() : undefined;
    const inside =
      tray !== undefined && clientX >= tray.left && clientX <= tray.right && clientY >= tray.top && clientY <= tray.bottom;
    return inside ? { kind: "tray" } : { kind: "axis" };
  };

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

  /**
   * 松手会叠到哪块上：照松手后的样子量指针落在哪块的中间（timeline-drop 的 ontoAt、decideOnto），previous 是现在的判定。
   * 只量指针所在那一行（竖排是正在看的那一天）：块画在哪按道、缩进、时间算，这一行的横轴在屏幕上的位置读 DOM。
   */
  const ontoAfterDrop = (next: Drag, previous: string | null): string | null => {
    const { plan, libraryView, rows, filter, day, laneHeight } = latest.current;
    const row = day ?? next.now.row;
    const axis = axisElements.current[row]!.getBoundingClientRect();
    const excluded = new Set([next.blockId, ...next.followers]);
    if (next.alt) for (const id of [...excluded]) excluded.add(previewCopyId(id));
    const hitWith = (ontoId: string | null) => {
      const action = dropAction({ ...next, ontoId }, plan, day);
      const dropped = action && droppedPlan(plan, libraryView, action);
      if (!dropped) return null;
      return ontoAt(
        { x: next.lastX, y: next.lastY },
        {
          plan: dropped,
          library: libraryView,
          layout: droppedRow(dropped, libraryView, filter, row, day === null ? rows[row]! : null),
          axis,
          orientation: day === null ? "wide" : "day",
          laneHeight,
          excluded,
          kindLayer: kindLayer(dropped.blocks.get(next.blockId)!, libraryView),
        },
      );
    };
    return decideOnto(previous, hitWith);
  };

  /** 指针到了 (clientX, clientY)：重算落点、跟着走的块、会叠上去的块。 */
  const moveTo = (current: Drag, clientX: number, clientY: number, alt: boolean, moved: boolean) => {
    const { plan, libraryView } = latest.current;
    const now = spotAt(clientX, clientY);
    // 改长度不会进栏
    const zone = current.mode === "move" ? zoneAt(clientX, clientY) : { kind: "axis" as const };
    const followers =
      current.source !== "segment" || current.mode !== "move"
        ? []
        : current.active
          ? current.followers
          : followersOf(plan, libraryView, current.blockId);
    const next: Drag = {
      ...current,
      active: true,
      moved,
      now,
      zone,
      alt,
      lastX: clientX,
      lastY: clientY,
      followers,
      ontoId: null,
    };
    update(current.mode === "move" && zone.kind === "axis" ? { ...next, ontoId: ontoAfterDrop(next, current.ontoId) } : next);
  };

  /** 手指按满 0.5 秒：拿起来，指针还在按下的地方。 */
  const lift = () => {
    const current = dragRef.current;
    if (!current || current.active) return;
    moveTo(current, current.downX, current.downY, current.forceCopy, false);
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
      const copying = current.forceCopy || event.altKey;
      moveTo(current, event.clientX, event.clientY, copying, current.moved || distance >= DRAG_THRESHOLD_PX);
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
      draggedLastPress.current = current.moved;
      if (!current.cancelled && current.moved) commit({ ...current, alt: current.forceCopy || event.altKey });
    };

    const onKey = (event: KeyboardEvent) => {
      const current = dragRef.current;
      if (!current?.active || current.cancelled) return;
      if (event.key === "Escape") {
        event.preventDefault();
        update({ ...current, cancelled: true });
      } else if (event.key === "Alt" && !current.forceCopy) {
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
    // 手指按住横条、竖条、栏里的一件是要拿起来拖，不弹系统的长按菜单；输入框里长按要粘贴，鼠标右键也照常
    const onContextMenu = (event: MouseEvent) => {
      if (lastPressByMouse.current) return;
      if (event.target instanceof Element && event.target.closest("[data-segment], [data-undated-chip]")) {
        event.preventDefault();
      }
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

  /** 松手：按 dropAction 调一个操作（一步撤销）；结果和原来一样就不调。 */
  const commit = (done: Drag) => {
    const { doc, library, plan, libraryView, day } = latest.current;
    const action = dropAction(done, plan, day);
    if (!action) return;
    switch (action.kind) {
      case "undated": {
        if (!action.copy) {
          setBlockUndated(doc, action.blockId, { baseId: action.baseId, slot: action.slot });
          onDropped?.(action.blockId);
          return;
        }
        // 复制着拖进栏里：先在原处复制一份，再把这一份放进那一天那一格（同一个事务，一步撤销）
        const block = plan.blocks.get(action.blockId)!;
        doc.transact(() => {
          const copy = duplicateBlock(doc, library, action.blockId, {
            baseId: block.start_base_id,
            minute: block.start_minute!,
            placement: "beside",
          });
          if (!copy.ok) return;
          setBlockUndated(doc, copy.value.blockId, { baseId: action.baseId, slot: action.slot });
          onDropped?.(copy.value.blockId);
          // 事务的来源要和 core 的操作一样，撤销才记得住这一步
        }, LOCAL_ORIGIN);
        return;
      }
      case "timed":
        setBlockTimed(doc, library, action.blockId, {
          baseId: action.baseId,
          minute: action.minute,
          duration: action.duration,
          ...placementOf(action.ontoId),
        });
        onDropped?.(action.blockId);
        return;
      case "resize-end":
        if (action.duration !== done.span.duration) resizeBlock(doc, action.blockId, action.duration);
        onDropped?.(action.blockId);
        return;
      case "resize-start":
        if (action.minute !== done.span.start) {
          resizeBlockStart(doc, action.blockId, { baseId: action.baseId, minute: action.minute });
        }
        onDropped?.(action.blockId);
        return;
      case "move": {
        const target = { baseId: action.baseId, minute: action.minute, ...placementOf(action.ontoId) };
        if (action.copy) {
          const copy = duplicateBlock(doc, library, action.blockId, target);
          if (copy.ok) onDropped?.(copy.value.blockId);
          return;
        }
        const block = plan.blocks.get(action.blockId)!;
        const layerAfter = action.ontoId === null ? null : layerWhenOnto(plan, libraryView, block, action.ontoId);
        const unmoved = action.minute === clampStart(done.span.start, done.span, plan.bases.length, day);
        // 拖回原地什么都不用改，但拖过的那一件照样接着选中
        if (unmoved && layerAfter === block.layer) {
          onDropped?.(action.blockId);
          return;
        }
        moveBlock(doc, library, action.blockId, target);
        onDropped?.(action.blockId);
      }
    }
  };

  const suppressClickAfterDrag = (event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressClick.current) return;
    event.stopPropagation();
    event.preventDefault();
  };
  /** 上一次按住的过程中挪过没有：「复制」按钮拖过才拦点击，长按没挪就抬起还算点一下 */
  const draggedLastPress = useRef(false);

  /** 按下：记下按在哪；鼠标挪 4 像素才开始拖，手指、笔开始长按计时。 */
  const startPress = (
    event: ReactPointerEvent<HTMLElement>,
    fields: Pick<Drag, "source" | "blockId" | "mode" | "span" | "zone"> & { forceCopy?: boolean },
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
      forceCopy: fields.forceCopy ?? false,
      // 从「复制」按住拖出来的一直算复制，不看 Alt
      alt: (fields.forceCopy ?? false) || event.altKey,
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

  const copyHandlers: CopyHandlers = {
    onPointerDown: (event, blockId) => {
      if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      const block = plan.blocks.get(blockId);
      if (!block || block.start_minute === null) return;
      const startRow = plan.bases.findIndex((base) => base.id === block.start_base_id);
      startPress(event, {
        source: "segment",
        blockId,
        mode: "move",
        span: { start: startRow * MINUTES_PER_DAY + block.start_minute, duration: block.duration_min ?? 0 },
        zone: { kind: "axis" },
        forceCopy: true,
      });
    },
    onClickCapture: (event) => {
      if (!draggedLastPress.current) return;
      suppressClickAfterDrag(event);
    },
    liftedByFinger: () => dragRef.current?.touch === true && dragRef.current.active && dragRef.current.forceCopy,
  };

  const chipHandlers: ChipHandlers = {
    onPointerDown: (event, blockId, row) => {
      if (dragRef.current || (event.pointerType === "mouse" && event.button !== 0)) return;
      const block = plan.blocks.get(blockId)!;
      startPress(event, {
        source: "chip",
        blockId,
        mode: "move",
        span: { start: 0, duration: block.duration_min ?? 0 },
        zone: { kind: "tray" },
      });
    },
    onClickCapture: suppressClickAfterDrag,
  };

  const live = drag?.active && !drag.cancelled ? drag : null;
  const onAxis = live?.zone.kind === "axis";
  const copying = live !== null && live.source === "segment" && live.mode === "move" && live.alt && onAxis;
  // 松手后的样子：指针挪了但吸附后要做的事没变，就不重算
  const action = live && onAxis ? dropAction(live, plan, day) : null;
  const actionKey = action === null ? "" : JSON.stringify(action);
  const dropped = useMemo<DroppedView | null>(
    () => {
      const shownPlan = action && droppedPlan(plan, libraryView, action);
      return shownPlan ? { plan: shownPlan, rows: droppedRows(shownPlan, libraryView, filter, rows, day === null) } : null;
    },
    // action 每次渲染都是新对象，按它的内容缓存
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [actionKey, plan, libraryView, filter, rows, day],
  );
  const liftedId = live && dropped ? (copying ? previewCopyId(live.blockId) : live.blockId) : null;
  const dragView: DragView | null = live
    ? {
        blockId: live.blockId,
        copying,
        liftedId,
        followers: dropped ? live.followers.map((id) => (copying ? previewCopyId(id) : id)) : [],
        ontoId: live.ontoId,
      }
    : null;
  const lifted = dropped && liftedId !== null ? dropped.plan.blocks.get(liftedId) : undefined;

  return {
    dragView,
    dropped,
    trayDrop: live ? trayDropOf(live, plan) : null,
    // 块自己挪到了松手后的位置，手指按着的地方也看不见：松手后的时间写在指针上方
    pointerLabel:
      live && dropped && lifted ? { text: liftedLabel(lifted, dropped.plan, copying), x: live.lastX, y: live.lastY } : null,
    handlers,
    chipHandlers,
    copyHandlers,
    rowRef: (index) => (element) => {
      rowElements.current[index] = element;
    },
    axisRef: (index) => (element) => {
      axisElements.current[index] = element;
    },
    trayRef: (element) => {
      trayElement.current = element;
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

/** 松手后的时间：写法同安排表的时间格，复制时前面加「复制 · 」。 */
function liftedLabel(block: BlockView, plan: PlanView, copying: boolean): string {
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const time = blockTimeLabel(block, date);
  return copying ? `复制 · ${time}` : time;
}

/** 拖进条里时：条描边、写会进哪一格（复制着拖的写明「复制 · 」）。条里的一件拖回条里不算。 */
function trayDropOf(drag: Drag, plan: PlanView): TrayDrop | null {
  if (drag.zone.kind !== "tray" || drag.source === "chip") return null;
  const block = plan.blocks.get(drag.blockId);
  if (!block || block.start_minute === null) return null;
  const slot = slotOfMinute(block.start_minute);
  const label = slotLabel(slot === "day" ? null : slot);
  return { label: drag.forceCopy ? `复制 · ${label}` : label };
}
