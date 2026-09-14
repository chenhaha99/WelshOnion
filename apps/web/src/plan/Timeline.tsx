import type { BaseView, LibraryView, PlanView, StatsFilter } from "@welshonion/core";
import {
  useMemo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { BlockBubble } from "./BlockBubble";
import { blockTimeLabel } from "./block-time";
import { dayRowLabels } from "./day-labels";
import type { MoneyCell } from "./money-cells";
import { layoutRow, timelineSegments, type PlacedSegment, type RowLayout } from "./timeline-layout";
import { UndatedTray } from "./UndatedTray";
import { useTimelineDrag, type DragView, type Preview, type SegmentHandlers } from "./use-timeline-drag";

const MINUTES_PER_DAY = 1440;
const DELETED_COLOR = "#9aa3ad";
const HOUR_TICKS = Array.from({ length: 13 }, (_, index) => index * 2);
const HOUR_LINES = Array.from({ length: 23 }, (_, index) => index + 1);
/** 背景条每条、主轨每道多高；叠在上面的块每级从上面缩多少（像素） */
const STRIP_HEIGHT = 16;
const LANE_HEIGHT = 28;
const GAP = 2;
const DEPTH_INSET = 4;
/** 每行三栏：标签、横轴、「没排时间」 */
const ROW_COLUMNS = "grid grid-cols-[5.5rem_1fr_9rem] gap-x-3";

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

/**
 * 时间轴：一天一行，横向 0–24 点按真实比例，排上时间的块画成横条，右边一栏放这天没排时间的事。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条看详情。拖拽见 use-timeline-drag。
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
  const drag = useTimelineDrag({ doc, library, plan, libraryView, rows, filter });

  return (
    <section
      aria-label="时间轴"
      data-timeline-dragging={drag.dragView ? true : undefined}
      className="glass-card flex flex-col gap-2 px-5 py-3 select-none"
    >
      <h2 className="text-sm font-medium text-ink">时间轴</h2>
      {!hasTimed && (
        <p className="text-sm text-ink-muted">
          排上时间的事会画在这里：把右边没排时间的事拖到时间轴上，或者在下面的安排表里点时间格
        </p>
      )}
      {/* 横轴至少 720 像素（每小时 30 像素），放不下就在卡片里横着滚 */}
      <div data-timeline-scroll className="-mx-2 overflow-x-auto px-2 pb-1">
        <div className="min-w-[62rem] pr-3">
          <div aria-hidden className={ROW_COLUMNS}>
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
            <span className="text-[11px] leading-4 text-ink-muted">没排时间</span>
          </div>
          <ol className="flex flex-col">
            {plan.bases.map((base, index) => (
              <TimelineRow
                key={base.id}
                rowRef={drag.rowRef(index)}
                axisRef={drag.axisRef(index)}
                trayRef={drag.trayRef(index)}
                plan={plan}
                base={base}
                label={labels[index]!}
                layout={rows[index]!}
                moneyCells={moneyCells}
                filter={filter}
                dragView={drag.dragView}
                preview={drag.preview && { ...drag.preview, pieces: drag.preview.pieces.filter((piece) => piece.row === index) }}
                labelHere={drag.preview !== null && drag.preview.pieces[0]?.row === index}
                trayDropLabel={drag.trayDrop?.row === index ? drag.trayDrop.label : null}
                handlers={drag.handlers}
                onChipPointerDown={(event, blockId) => drag.chipHandlers.onPointerDown(event, blockId, index)}
                onChipClickCapture={drag.chipHandlers.onClickCapture}
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
  trayRef: (element: HTMLDivElement | null) => void;
  plan: PlanView;
  base: BaseView;
  label: string;
  layout: RowLayout;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  filter: StatsFilter | undefined;
  dragView: DragView | null;
  /** 这一行的预览框；没在拖是 null */
  preview: Preview | null;
  /** 预览框的时间写在这一行（第一段所在的行） */
  labelHere: boolean;
  /** 正拖进这一行的「没排时间」栏时，会进哪一格；没往这里拖是 null */
  trayDropLabel: string | null;
  handlers: SegmentHandlers;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

function TimelineRow({
  rowRef,
  axisRef,
  trayRef,
  plan,
  base,
  label,
  layout,
  moneyCells,
  filter,
  dragView,
  preview,
  labelHere,
  trayDropLabel,
  handlers,
  onChipPointerDown,
  onChipClickCapture,
}: TimelineRowProps) {
  const stripsHeight = layout.backgroundCount * STRIP_HEIGHT;
  const [dayNumber, ...rest] = label.split(" · ");

  return (
    <li ref={rowRef} aria-label={label} className={`${ROW_COLUMNS} border-t border-ink/5 py-1.5`}>
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
      <UndatedTray
        plan={plan}
        base={base}
        moneyCells={moneyCells}
        filter={filter}
        trayRef={trayRef}
        dropLabel={trayDropLabel}
        draggingId={dragView && !dragView.copying ? dragView.blockId : null}
        onChipPointerDown={onChipPointerDown}
        onChipClickCapture={onChipClickCapture}
      />
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
