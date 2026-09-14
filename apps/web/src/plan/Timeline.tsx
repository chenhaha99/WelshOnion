import {
  duplicateBlock,
  followersOf,
  kindLayer,
  layerWhenOnto,
  moveBlock,
  resizeBlock,
  resizeBlockStart,
  type BlockView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
  type TransportMode,
} from "@welshonion/core";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { distanceKmText } from "./block-details";
import { blockTimeLabel, durationLabel } from "./block-time";
import { dayRowLabels } from "./day-labels";
import { moneyCellLabel, type MoneyCell } from "./money-cells";
import {
  clampLinear,
  dragResult,
  previewSegments,
  splitLinear,
  type DragMode,
  type PointerSpot,
  type Span,
} from "./timeline-drag";
import { layoutRow, timelineSegments, type PlacedSegment, type RowLayout } from "./timeline-layout";

const MINUTES_PER_DAY = 1440;
const DELETED_COLOR = "#9aa3ad";
const HOUR_TICKS = Array.from({ length: 13 }, (_, index) => index * 2);
const HOUR_LINES = Array.from({ length: 23 }, (_, index) => index + 1);
/** 背景条每条、主轨每道多高；叠在上面的块每级从上面缩多少（像素） */
const STRIP_HEIGHT = 16;
const LANE_HEIGHT = 28;
const GAP = 2;
const DEPTH_INSET = 4;
/** 按下后移动多少像素才算开始拖；端点多宽；横条至少多宽才有端点（像素） */
const DRAG_THRESHOLD_PX = 4;
const EDGE_PX = 6;
const MIN_EDGE_BAR_PX = 24;

const TRANSPORT_NAMES: Readonly<Record<TransportMode, string>> = { drive: "自驾", transit: "公共交通", walk: "步行" };

interface TimelineProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  /** 全计划的钱格摘要（已按筛选算过），详情里的钱用它 */
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
}

/** 按住一段横条以后的状态：过了 4 像素的门槛才算在拖；放弃了的留到松手再清掉。 */
interface Drag {
  blockId: string;
  mode: DragMode;
  downX: number;
  downY: number;
  down: PointerSpot;
  /** 按下时块的开始（线性分钟）和时长 */
  span: Span;
  active: boolean;
  cancelled: boolean;
  now: PointerSpot;
  alt: boolean;
  /** 松手会叠上去的块；null 是放旁边 */
  ontoId: string | null;
  followers: readonly string[];
}

/** 拖动中要画的：每段的状态和预览框。 */
interface DragView {
  blockId: string;
  copying: boolean;
  followers: readonly string[];
  ontoId: string | null;
}

interface Preview {
  pieces: Array<{ row: number; from: number; to: number }>;
  label: string;
  track: PlacedSegment["track"];
}

interface SegmentHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLDivElement>, item: PlacedSegment) => void;
  onPointerMove: (event: ReactPointerEvent<HTMLDivElement>, item: PlacedSegment) => void;
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

/**
 * 时间轴：一天一行，横向 0–24 点按真实比例，排上时间的块画成横条。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条看详情。
 * 用鼠标拖横条：中间挪时间或换天，两端改长度，按住 Alt 复制；松手才写进计划。
 */
export function Timeline({ doc, library, plan, libraryView, moneyCells, filter }: TimelineProps) {
  const labels = dayRowLabels(plan.bases);
  const rows = useMemo(() => {
    const segments = timelineSegments(plan, filter);
    return plan.bases.map((_, row) =>
      layoutRow(
        segments.filter((segment) => segment.row === row),
        plan,
        libraryView,
      ),
    );
  }, [plan, libraryView, filter]);
  const hasTimed = [...plan.blocks.values()].some((block) => block.start_minute !== null);

  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const rowElements = useRef<Array<HTMLLIElement | null>>([]);
  const axisElements = useRef<Array<HTMLDivElement | null>>([]);
  const suppressClick = useRef(false);
  // 窗口上的监听在按下时挂一次，要经过这里读最新的计划
  const latest = useRef({ doc, library, plan, libraryView });
  useEffect(() => {
    latest.current = { doc, library, plan, libraryView };
  });

  /** 指针落在第几行（第一行上面算第一行，最后一行下面算最后一行）、这一行第几分钟（不夹在 0–1440 里）。 */
  const spotAt = (clientX: number, clientY: number): PointerSpot => {
    const elements = rowElements.current.slice(0, latest.current.plan.bases.length);
    let row = elements.findIndex((element) => element !== null && clientY < element.getBoundingClientRect().bottom);
    if (row === -1) row = elements.length - 1;
    const axis = axisElements.current[row]!.getBoundingClientRect();
    return { row, minute: ((clientX - axis.left) / axis.width) * MINUTES_PER_DAY };
  };

  // 拖到一半块没了（被撤销、被筛掉、别的标签页删了）：横条没了，松手也收不到，直接清掉
  useEffect(() => {
    const current = dragRef.current;
    if (current && !rows.some((row) => [...row.background, ...row.main].some((item) => item.blockId === current.blockId))) {
      update(null);
    }
  }, [rows]);

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
      const followers =
        current.active || current.mode !== "move" ? current.followers : followersOf(plan, libraryView, current.blockId);
      update({
        ...current,
        active: true,
        now: spotAt(event.clientX, event.clientY),
        alt: event.altKey,
        followers,
        ontoId: current.mode === "move" ? dropTargetAt(event.clientX, event.clientY, current.blockId, followers) : null,
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

  /** 松手：按拖法调一个操作（一步撤销）；结果和原来一样就不调。 */
  const commit = (done: Drag) => {
    const { doc, library, plan, libraryView } = latest.current;
    // 松手前别的标签页刚把它删了或取消了时间
    const block = plan.blocks.get(done.blockId);
    if (!block || block.start_minute === null) return;
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

    const target =
      done.ontoId === null
        ? { baseId: origin, minute: start, placement: "beside" as const }
        : { baseId: origin, minute: start, placement: "onto" as const, ontoBlockId: done.ontoId };
    if (done.alt) {
      duplicateBlock(doc, library, block.id, target);
      return;
    }
    const layerAfter = done.ontoId === null ? null : layerWhenOnto(plan, libraryView, block, done.ontoId);
    if (start === clampLinear(done.span.start, rowCount) && layerAfter === block.layer) return;
    moveBlock(doc, library, block.id, target);
  };

  const handlers: SegmentHandlers = {
    onPointerDown: (event, item) => {
      // 只认鼠标左键：手机上手指滑动还是滚动时间轴
      if (event.pointerType !== "mouse" || event.button !== 0 || dragRef.current) return;
      const block = plan.blocks.get(item.blockId)!;
      const startRow = plan.bases.findIndex((base) => base.id === block.start_base_id);
      const down = spotAt(event.clientX, event.clientY);
      update({
        blockId: item.blockId,
        mode: edgeAt(event.currentTarget.getBoundingClientRect(), event.clientX, item),
        downX: event.clientX,
        downY: event.clientY,
        down,
        span: { start: startRow * MINUTES_PER_DAY + block.start_minute!, duration: block.duration_min ?? 0 },
        active: false,
        cancelled: false,
        now: down,
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
    onClickCapture: (event) => {
      if (!suppressClick.current) return;
      event.stopPropagation();
      event.preventDefault();
    },
  };

  const dragView: DragView | null =
    drag?.active && !drag.cancelled
      ? {
          blockId: drag.blockId,
          copying: drag.alt && drag.mode === "move",
          followers: drag.mode === "move" ? drag.followers : [],
          ontoId: drag.ontoId,
        }
      : null;
  const preview = dragView && drag ? previewOf(drag, plan, rows) : null;

  return (
    <section
      aria-label="时间轴"
      data-timeline-dragging={dragView ? true : undefined}
      className="glass-card flex flex-col gap-2 px-5 py-3 select-none"
    >
      <h2 className="text-sm font-medium text-ink">时间轴</h2>
      {!hasTimed && <p className="text-sm text-ink-muted">排上时间的事会画在这里：在下面的安排表里点时间格排时间</p>}
      {/* 横轴至少 720 像素（每小时 30 像素），放不下就在卡片里横着滚 */}
      <div data-timeline-scroll className="-mx-2 overflow-x-auto px-2 pb-1">
        <div className="min-w-[52rem] pr-3">
          <div aria-hidden className="grid grid-cols-[5.5rem_1fr] gap-x-3">
            <span />
            <div className="relative h-4">
              {HOUR_TICKS.map((hour) => (
                <span
                  key={hour}
                  data-hour-tick
                  className="absolute -translate-x-1/2 text-[11px] leading-4 text-ink-muted tabular-nums"
                  style={{ left: percent(hour * 60) }}
                >
                  {hour}
                </span>
              ))}
            </div>
          </div>
          <ol className="flex flex-col">
            {plan.bases.map((base, index) => (
              <TimelineRow
                key={base.id}
                rowRef={(element) => {
                  rowElements.current[index] = element;
                }}
                axisRef={(element) => {
                  axisElements.current[index] = element;
                }}
                plan={plan}
                label={labels[index]!}
                layout={rows[index]!}
                moneyCells={moneyCells}
                dragView={dragView}
                preview={preview && { ...preview, pieces: preview.pieces.filter((piece) => piece.row === index) }}
                labelHere={preview !== null && preview.pieces[0]?.row === index}
                handlers={handlers}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface TimelineRowProps {
  rowRef: (element: HTMLLIElement | null) => void;
  axisRef: (element: HTMLDivElement | null) => void;
  plan: PlanView;
  label: string;
  layout: RowLayout;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  dragView: DragView | null;
  /** 这一行的预览框；没在拖是 null */
  preview: Preview | null;
  /** 预览框的时间写在这一行（第一段所在的行） */
  labelHere: boolean;
  handlers: SegmentHandlers;
}

function TimelineRow({
  rowRef,
  axisRef,
  plan,
  label,
  layout,
  moneyCells,
  dragView,
  preview,
  labelHere,
  handlers,
}: TimelineRowProps) {
  const stripsHeight = layout.backgroundCount * STRIP_HEIGHT;
  const [dayNumber, ...rest] = label.split(" · ");

  return (
    <li ref={rowRef} aria-label={label} className="grid grid-cols-[5.5rem_1fr] gap-x-3 border-t border-ink/5 py-1.5">
      <div aria-hidden className="flex flex-col text-xs leading-4 text-ink-muted tabular-nums">
        <span className="text-ink">{dayNumber}</span>
        {rest.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </div>
      <div
        ref={axisRef}
        data-timeline-axis
        className="relative"
        style={{ minHeight: stripsHeight + layout.laneCount * LANE_HEIGHT }}
      >
        {HOUR_LINES.map((hour) => (
          <div
            key={hour}
            aria-hidden
            className={`absolute inset-y-0 w-px ${hour % 6 === 0 ? "bg-ink/12" : "bg-ink/5"}`}
            style={{ left: percent(hour * 60) }}
          />
        ))}
        {layout.background.map((item) => (
          <div
            key={`wash-${item.blockId}`}
            aria-hidden
            className="timeline-wash absolute bottom-0"
            style={{ ...horizontal(item), top: stripsHeight, ...kindColor(plan, item) }}
          />
        ))}
        {[...layout.background, ...layout.main].map((item) => (
          <Segment
            key={`${item.track}-${item.blockId}`}
            plan={plan}
            item={item}
            top={
              item.track === "background"
                ? (item.lane - 1) * STRIP_HEIGHT
                : stripsHeight + (item.lane - 1) * LANE_HEIGHT + GAP + item.depth * DEPTH_INSET
            }
            height={
              item.track === "background" ? STRIP_HEIGHT - GAP : LANE_HEIGHT - 2 * GAP - item.depth * DEPTH_INSET
            }
            moneyCell={moneyCells.get(item.blockId)}
            dragView={dragView}
            handlers={handlers}
          />
        ))}
        {preview?.pieces.map((piece, index) => (
          <div
            key={`ghost-${index}`}
            data-drag-ghost
            className="timeline-ghost"
            style={{
              left: percent(piece.from),
              width: percent(piece.to - piece.from),
              ...(preview.track === "background"
                ? { top: 0, height: Math.max(stripsHeight, STRIP_HEIGHT) - GAP }
                : { top: stripsHeight, height: layout.laneCount * LANE_HEIGHT }),
            }}
          >
            {labelHere && index === 0 ? preview.label : ""}
          </div>
        ))}
      </div>
    </li>
  );
}

interface SegmentProps {
  plan: PlanView;
  item: PlacedSegment;
  top: number;
  height: number;
  moneyCell: MoneyCell | undefined;
  dragView: DragView | null;
  handlers: SegmentHandlers;
}

/** 一段横条：外框放位置、data 属性和拖拽的监听，里面的按钮点开详情。 */
function Segment({ plan, item, top, height, moneyCell, dragView, handlers }: SegmentProps) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const time = blockTimeLabel(block, date);
  const name = `${block.title} ${time}`;
  const point = item.from === item.to;
  const buttonClass = point ? "timeline-marker" : item.track === "background" ? "timeline-strip" : "timeline-bar";

  return (
    <div
      data-segment
      data-block-id={item.blockId}
      data-from={item.from}
      data-to={item.to}
      data-track={item.track}
      data-lane={item.lane}
      data-depth={item.depth}
      data-pending={block.status.id === "pending"}
      data-continues-before={item.continuesBefore}
      data-continues-after={item.continuesAfter}
      data-dragging={dragView?.blockId === item.blockId && !dragView.copying ? true : undefined}
      data-follower={dragView?.followers.includes(item.blockId) ? true : undefined}
      data-drop-target={dragView?.ontoId === item.blockId ? true : undefined}
      className="absolute"
      // 缩得越深的画得越靠上：谁压谁不看在页面里的先后
      style={{ ...horizontal(item), top, height, zIndex: 1 + item.depth, ...kindColor(plan, item) }}
      onPointerDown={(event) => handlers.onPointerDown(event, item)}
      onPointerMove={(event) => handlers.onPointerMove(event, item)}
      onClickCapture={handlers.onClickCapture}
    >
      <Popover
        label={name}
        triggerTitle={name}
        trigger={point ? null : block.title}
        triggerClassName={buttonClass}
        role="dialog"
        panelLabel={block.title}
        panelClassName="menu w-72 p-3"
        align="start"
        estimatedHeight={220}
      >
        {(close) => <BlockBubble block={block} time={time} moneyCell={moneyCell} close={close} />}
      </Popover>
    </div>
  );
}

interface BlockBubbleProps {
  block: BlockView;
  time: string;
  moneyCell: MoneyCell | undefined;
  close: (returnFocus?: boolean) => void;
}

/** 详情气泡：只读，要改就「在表里改」跳到安排表那一行。 */
function BlockBubble({ block, time, moneyCell, close }: BlockBubbleProps) {
  const duration = block.duration_min ?? 0;
  const route = routeText(block);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <h3 className="font-medium text-ink">{block.title}</h3>
      <p className="text-ink-muted">
        {block.kind.deleted ? "已删除的类型" : block.kind.name} · {block.status.deleted ? "已删除的状态" : block.status.name}
      </p>
      <p className="text-ink tabular-nums">{duration === 0 ? time : `${time} · ${durationLabel(duration)}`}</p>
      {block.subtitle !== null && <p className="text-ink-muted">{block.subtitle}</p>}
      {route !== null && <p className="text-ink">{route}</p>}
      {moneyCell !== undefined && <p className="text-ink tabular-nums">钱：{moneyCellLabel(moneyCell)}</p>}
      {block.note !== null && <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-ink-muted">{block.note}</p>}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            close();
            focusInTable(block.id);
          }}
        >
          在表里改
        </button>
      </div>
    </div>
  );
}

/** 按在横条的哪里：左右各 6 像素是端点（横条至少 24 像素宽才有；接着上一行、下一行的那头没有），其余是挪。 */
function edgeAt(rect: DOMRect, clientX: number, item: PlacedSegment): DragMode {
  if (rect.width < MIN_EDGE_BAR_PX) return "move";
  const offset = clientX - rect.left;
  if (!item.continuesBefore && offset <= EDGE_PX) return "start";
  if (!item.continuesAfter && rect.width - offset <= EDGE_PX) return "end";
  return "move";
}

/** 拖动中的预览框：松手后的时间段，每行一段；框里写开始和结束，复制时前面加「复制 · 」。块已经不画了就没有预览。 */
function previewOf(drag: Drag, plan: PlanView, rows: readonly RowLayout[]): Preview | null {
  const drawn = rows.flatMap((row) => [...row.background, ...row.main]).find((item) => item.blockId === drag.blockId);
  if (!drawn) return null;
  const rowCount = plan.bases.length;
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

/** 表和时间轴用同一个筛选：时间轴上看得见的块，表里一定有这一行。 */
function focusInTable(blockId: string): void {
  const title = document.querySelector<HTMLElement>(`tr[data-block-id="${blockId}"] input[aria-label="标题"]`)!;
  title.scrollIntoView({ block: "center" });
  title.focus();
}

/** 「自驾 · 132 公里」；没有交通方式、没有距离时各自不写，都没有是 null。 */
function routeText(block: BlockView): string | null {
  const parts = [
    block.transport_mode === null ? null : TRANSPORT_NAMES[block.transport_mode],
    block.distance_m === null ? null : `${distanceKmText(block.distance_m)} 公里`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(" · ");
}

function percent(minutes: number): string {
  return `${(minutes / MINUTES_PER_DAY) * 100}%`;
}

function horizontal(item: PlacedSegment): CSSProperties {
  return { left: percent(item.from), width: percent(item.to - item.from) };
}

function kindColor(plan: PlanView, item: PlacedSegment): CSSProperties {
  const kind = plan.blocks.get(item.blockId)!.kind;
  return { "--kind-color": kind.deleted ? DELETED_COLOR : kind.color } as CSSProperties;
}
