import {
  shiftDayFrom,
  type BaseView,
  type BlockView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import {
  useMemo,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type * as Y from "yjs";
import { useWideScreen } from "../app/use-wide-screen";
import { BlockPopover } from "./BlockBubble";
import { blockTimeLabel } from "./block-time";
import { DayTimeline } from "./DayTimeline";
import { DragLabel } from "./DragLabel";
import { dayRowLabels } from "./day-labels";
import type { MoneyCell } from "./money-cells";
import { HOUR_LINES, HOUR_TICKS, kindColor, percent } from "./timeline-draw";
import { LIFTED_Z_INDEX, wideAxisHeight, wideSegmentBox, wideStripsHeight } from "./timeline-geometry";
import { layoutRow, timelineSegments, type PlacedSegment, type RowLayout } from "./timeline-layout";
import { UndatedTray, undatedBlocks } from "./UndatedTray";
import { useTimelineDrag, type DragView, type SegmentHandlers } from "./use-timeline-drag";
import { zoneTimeLabel } from "./zone-time";

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
  /** 一件事都没有时点「加第一件事」：切到列表、分组回到按天，焦点放到第 1 天的「加一件事」 */
  onAddFirst: () => void;
  /** 竖排看的是哪天（底座 id）：DayList 记着，切到列表再切回来接着看这天 */
  shownDay: { current: string | null };
}

/**
 * 时间轴：屏幕够宽时横着铺（一天一行），窄屏上竖着铺、一次一天（见 DayTimeline）；两种都能拖（见 use-timeline-drag）。
 * 两种都用同一份几何：每个块画在哪几行、一行里分到哪一道。
 */
export function Timeline({ doc, library, plan, libraryView, moneyCells, filter, onAddFirst, shownDay }: TimelineProps) {
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
  const wide = useWideScreen();
  // 详情里「这天从这件起往后推迟」：只交给排上时间的横条、竖条
  const shiftLater = (block: BlockView, deltaMin: number) => {
    shiftDayFrom(doc, library, block.start_base_id, block.start_minute!, deltaMin);
  };

  return (
    <section aria-label="时间轴" className="glass-card flex flex-col gap-2 px-5 py-3 select-none">
      <h2 className="text-sm font-medium text-ink">时间轴</h2>
      {plan.blocks.size === 0 ? (
        // 一件事都没有：右边的栏是空的，「加一件事」在列表里，直接给个按钮
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-ink-muted">还没有事。加了事、排上时间，就会画在这里</p>
          <button type="button" className="btn btn-primary" onClick={onAddFirst}>
            加第一件事
          </button>
        </div>
      ) : (
        // 竖排没有右边的栏
        !hasTimed && (
          <p className="text-sm text-ink-muted">
            {wide
              ? "排上时间的事会画在这里：把右边没排时间的事拖到时间轴上，或者在列表里点时间格"
              : "排上时间的事会画在这里：在列表里点时间格"}
          </p>
        )
      )}
      {wide ? (
        <WideTimeline
          doc={doc}
          library={library}
          plan={plan}
          libraryView={libraryView}
          rows={rows}
          labels={labels}
          moneyCells={moneyCells}
          filter={filter}
          shiftLater={shiftLater}
        />
      ) : (
        <DayTimeline
          doc={doc}
          library={library}
          plan={plan}
          libraryView={libraryView}
          rows={rows}
          labels={labels}
          moneyCells={moneyCells}
          filter={filter}
          shiftLater={shiftLater}
          shownDay={shownDay}
        />
      )}
    </section>
  );
}

interface WideTimelineProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  rows: readonly RowLayout[];
  labels: readonly string[];
  moneyCells: ReadonlyMap<string, MoneyCell>;
  filter: StatsFilter | undefined;
  shiftLater: (block: BlockView, deltaMin: number) => void;
}

/**
 * 横排：一天一行，横向 0–24 点按真实比例，右边一栏放这天没排时间的事。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条看详情。
 * 拖动中画成松手后的样子，「没排时间」栏照原来的计划（见 use-timeline-drag）。
 */
function WideTimeline({
  doc,
  library,
  plan,
  libraryView,
  rows,
  labels,
  moneyCells,
  filter,
  shiftLater,
}: WideTimelineProps) {
  const drag = useTimelineDrag({ doc, library, plan, libraryView, rows, filter, day: null });
  const shownPlan = drag.dropped?.plan ?? plan;
  const shownRows = drag.dropped?.rows ?? rows;

  return (
    // 横轴至少 720 像素（每小时 30 像素），放不下就在卡片里横着滚
    <div
      ref={drag.containerRef}
      data-timeline-scroll
      data-timeline-dragging={drag.dragView ? true : undefined}
      className="-mx-2 overflow-x-auto px-2 pb-1"
    >
      <div className="min-w-[62rem] pr-3">
        <div aria-hidden className={ROW_COLUMNS}>
          <span />
          <div className="relative h-4">
            {HOUR_TICKS.map((hour) => (
              <span
                key={hour}
                data-hour-tick
                // 最右的「24」右对齐到 24 点那条线，不伸进「没排时间」那一栏
                className={`absolute ${hour === 24 ? "-translate-x-full" : "-translate-x-1/2"} text-[11px] leading-4 text-ink-muted tabular-nums`}
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
              plan={shownPlan}
              trayPlan={plan}
              base={base}
              label={labels[index]!}
              layout={shownRows[index]!}
              moneyCells={moneyCells}
              filter={filter}
              dragView={drag.dragView}
              trayDropLabel={drag.trayDrop?.row === index ? drag.trayDrop.label : null}
              handlers={drag.handlers}
              shiftLater={shiftLater}
              onChipPointerDown={(event, blockId) => drag.chipHandlers.onPointerDown(event, blockId, index)}
              onChipClickCapture={drag.chipHandlers.onClickCapture}
            />
          ))}
        </ol>
      </div>
      {drag.pointerLabel && <DragLabel label={drag.pointerLabel} />}
    </div>
  );
}

interface TimelineRowProps {
  rowRef: (element: HTMLLIElement | null) => void;
  axisRef: (element: HTMLDivElement | null) => void;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 画横条用的计划：拖动中是松手后的 */
  plan: PlanView;
  /** 「没排时间」栏用的计划：拖动中还是原来的，被拖的那一件留在栏里变淡 */
  trayPlan: PlanView;
  base: BaseView;
  label: string;
  layout: RowLayout;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  filter: StatsFilter | undefined;
  dragView: DragView | null;
  /** 正拖进这一行的「没排时间」栏时，会进哪一格；没往这里拖是 null */
  trayDropLabel: string | null;
  handlers: SegmentHandlers;
  shiftLater: (block: BlockView, deltaMin: number) => void;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

function TimelineRow({
  rowRef,
  axisRef,
  trayRef,
  plan,
  trayPlan,
  base,
  label,
  layout,
  moneyCells,
  filter,
  dragView,
  trayDropLabel,
  handlers,
  shiftLater,
  onChipPointerDown,
  onChipClickCapture,
}: TimelineRowProps) {
  const [dayNumber, ...rest] = label.split(" · ");

  return (
    <li ref={rowRef} aria-label={label} className={`${ROW_COLUMNS} border-t border-ink/5 py-1.5`}>
      <div aria-hidden className="flex flex-col text-xs leading-4 text-ink-muted tabular-nums">
        <span className="text-ink">{dayNumber}</span>
        {rest.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </div>
      <div ref={axisRef} data-timeline-axis className="relative" style={{ minHeight: wideAxisHeight(layout) }}>
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
            style={{ ...horizontal(item), top: wideStripsHeight(layout), ...kindColor(plan, item.blockId) }}
          />
        ))}
        {[...layout.background, ...layout.main].map((item) => (
          <Segment
            key={`${item.track}-${item.blockId}`}
            plan={plan}
            item={item}
            box={wideSegmentBox(item, layout)}
            moneyCell={moneyCells.get(item.blockId)}
            dragView={dragView}
            handlers={handlers}
            shiftLater={shiftLater}
          />
        ))}
      </div>
      <UndatedTray
        plan={trayPlan}
        base={base}
        blocks={undatedBlocks(trayPlan, base, filter)}
        moneyCells={moneyCells}
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
  /** 在这一行横轴里的上边和高度（像素） */
  box: { top: number; height: number };
  moneyCell: MoneyCell | undefined;
  dragView: DragView | null;
  handlers: SegmentHandlers;
  shiftLater: (block: BlockView, deltaMin: number) => void;
}

/** 一段横条：外框放位置、data 属性和拖拽的监听，里面的按钮点开详情。 */
function Segment({ plan, item, box, moneyCell, dragView, handlers, shiftLater }: SegmentProps) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const point = item.from === item.to;
  const buttonClass = point ? "timeline-marker" : item.track === "background" ? "timeline-strip" : "timeline-bar";
  const lifted = dragView?.liftedId === item.blockId;

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
      data-lifted={lifted ? true : undefined}
      // 指针在「没排时间」栏里时时间轴不重排：被拖的横条留在原处变淡
      data-dragging={
        dragView && dragView.liftedId === null && !dragView.copying && dragView.blockId === item.blockId ? true : undefined
      }
      data-follower={dragView?.followers.includes(item.blockId) ? true : undefined}
      data-drop-target={dragView?.ontoId === item.blockId ? true : undefined}
      className="absolute"
      // 缩得越深的画得越靠上：谁压谁不看在页面里的先后；拿起来的块压在最上面
      style={{
        ...horizontal(item),
        ...box,
        zIndex: lifted ? LIFTED_Z_INDEX : 1 + item.depth,
        ...kindColor(plan, item.blockId),
      }}
      onPointerDown={(event) => handlers.onPointerDown(event, item)}
      onPointerMove={(event) => handlers.onPointerMove(event, item)}
      onClickCapture={handlers.onClickCapture}
    >
      <BlockPopover
        block={block}
        time={zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}
        trigger={point ? null : block.title}
        triggerClassName={buttonClass}
        align="start"
        moneyCell={moneyCell}
        onShiftLater={(deltaMin) => shiftLater(block, deltaMin)}
      />
    </div>
  );
}

function horizontal(item: PlacedSegment): CSSProperties {
  return { left: percent(item.from), width: percent(item.to - item.from) };
}
