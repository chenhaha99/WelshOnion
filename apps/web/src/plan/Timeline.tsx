import type { BaseView, LibraryView, PlanView, StatsFilter } from "@welshonion/core";
import {
  useMemo,
  useRef,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type * as Y from "yjs";
import { useWideScreen } from "../app/use-wide-screen";
import { TimelineAddBlock } from "./AddBlock";
import { blockTimeLabel } from "./block-time";
import { useDayMenu } from "./day-menu";
import { DayTimeline } from "./DayTimeline";
import { DragLabel } from "./DragLabel";
import { dayRowLabels } from "./day-labels";
import { BlockButton } from "./open-block";
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
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
  /** 竖排看的是哪天（底座 id）：DayList 记着，切到列表再切回来接着看这天 */
  shownDay: { current: string | null };
}

/**
 * 时间轴：屏幕够宽时横着铺（一天一行），窄屏上竖着铺、一次一天（见 DayTimeline）；两种都能拖（见 use-timeline-drag）。
 * 两种都用同一份几何：每个块画在哪几行、一行里分到哪一道。点一件事打开详情面板；每天有「加一件事」和「这天的操作」。
 */
export function Timeline({ doc, library, plan, libraryView, filter, shownDay }: TimelineProps) {
  const section = useRef<HTMLElement>(null);
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
  // 「加第一件事」：时间轴上第一个「加一件事」（横排是第 1 天那一行的，竖排是正在看的这天的）滚到中间、给焦点
  const focusFirstAdd = () => {
    const input = section.current!.querySelector<HTMLInputElement>('input[aria-label="加一件事"]')!;
    input.scrollIntoView({ block: "center" });
    input.focus({ preventScroll: true });
  };

  return (
    <section ref={section} aria-label="时间轴" className="glass-card flex flex-col gap-2 px-5 py-3 select-none">
      <h2 className="text-sm font-medium text-ink">时间轴</h2>
      {plan.blocks.size === 0 ? (
        // 一件事都没有：栏是空的，栏下面的「加一件事」不显眼，直接给个按钮
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-ink-muted">还没有事。加了事、排上时间，就会画在这里</p>
          <button type="button" className="btn btn-primary" onClick={focusFirstAdd}>
            加第一件事
          </button>
        </div>
      ) : (
        // 竖排没有右边的栏
        !hasTimed && (
          <p className="text-sm text-ink-muted">
            {wide
              ? "排上时间的事会画在这里：把右边没排时间的事拖到时间轴上，或者点开它排时间"
              : "排上时间的事会画在这里：点开下面没排时间的事排时间"}
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
          filter={filter}
        />
      ) : (
        <DayTimeline
          doc={doc}
          library={library}
          plan={plan}
          libraryView={libraryView}
          rows={rows}
          labels={labels}
          filter={filter}
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
  filter: StatsFilter | undefined;
}

/**
 * 横排：一天一行，横向 0–24 点按真实比例，右边一栏放这天没排时间的事、下面「加一件事」。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条打开详情面板。
 * 拖动中画成松手后的样子，「没排时间」栏照原来的计划（见 use-timeline-drag）。
 */
function WideTimeline({ doc, library, plan, libraryView, rows, labels, filter }: WideTimelineProps) {
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
              doc={doc}
              library={library}
              rowRef={drag.rowRef(index)}
              axisRef={drag.axisRef(index)}
              trayRef={drag.trayRef(index)}
              plan={shownPlan}
              currentPlan={plan}
              base={base}
              label={labels[index]!}
              index={index}
              layout={shownRows[index]!}
              filter={filter}
              dragView={drag.dragView}
              trayDropLabel={drag.trayDrop?.row === index ? drag.trayDrop.label : null}
              handlers={drag.handlers}
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
  doc: Y.Doc;
  library: Y.Doc;
  rowRef: (element: HTMLLIElement | null) => void;
  axisRef: (element: HTMLDivElement | null) => void;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 画横条用的计划：拖动中是松手后的 */
  plan: PlanView;
  /** 没拖时的计划：「没排时间」栏、「加一件事」、这天的菜单用它；拖动中被拖的那一件还留在栏里，变淡 */
  currentPlan: PlanView;
  base: BaseView;
  label: string;
  index: number;
  layout: RowLayout;
  filter: StatsFilter | undefined;
  dragView: DragView | null;
  /** 正拖进这一行的「没排时间」栏时，会进哪一格；没往这里拖是 null */
  trayDropLabel: string | null;
  handlers: SegmentHandlers;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

function TimelineRow({
  doc,
  library,
  rowRef,
  axisRef,
  trayRef,
  plan,
  currentPlan,
  base,
  label,
  index,
  layout,
  filter,
  dragView,
  trayDropLabel,
  handlers,
  onChipPointerDown,
  onChipClickCapture,
}: TimelineRowProps) {
  const [dayNumber, ...rest] = label.split(" · ");
  // 标签那一栏窄：菜单按钮做小，放在「第 1 天」后面；展开的表单占满整行，在这一行下面
  const dayMenu = useDayMenu({
    doc,
    plan: currentPlan,
    base,
    label,
    index,
    count: currentPlan.bases.length,
    triggerClassName: "btn btn-ghost h-6 px-1.5",
  });

  return (
    <li ref={rowRef} aria-label={label} data-base-id={base.id} className={`${ROW_COLUMNS} border-t border-ink/5 py-1.5`}>
      <div className="flex flex-col text-xs leading-4 text-ink-muted tabular-nums">
        <div className="flex items-center gap-0.5">
          <span aria-hidden className="text-ink">
            {dayNumber}
          </span>
          {dayMenu.menu}
        </div>
        {rest.map((part) => (
          <span key={part} aria-hidden>
            {part}
          </span>
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
            dragView={dragView}
            handlers={handlers}
          />
        ))}
      </div>
      <UndatedTray
        plan={currentPlan}
        base={base}
        blocks={undatedBlocks(currentPlan, base, filter)}
        trayRef={trayRef}
        dropLabel={trayDropLabel}
        draggingId={dragView && !dragView.copying ? dragView.blockId : null}
        onChipPointerDown={onChipPointerDown}
        onChipClickCapture={onChipClickCapture}
      >
        {/* 和栏里的一件一样高 */}
        <TimelineAddBlock
          doc={doc}
          library={library}
          plan={currentPlan}
          baseId={base.id}
          filter={filter}
          className="input-bare h-[1.375rem] px-1.5 text-xs select-text"
        />
      </UndatedTray>
      {dayMenu.form !== null && <div className="col-span-3 py-1.5 select-text">{dayMenu.form}</div>}
    </li>
  );
}

interface SegmentProps {
  plan: PlanView;
  item: PlacedSegment;
  /** 在这一行横轴里的上边和高度（像素） */
  box: { top: number; height: number };
  dragView: DragView | null;
  handlers: SegmentHandlers;
}

/** 一段横条：外框放位置、data 属性和拖拽的监听，里面的按钮点开详情面板。 */
function Segment({ plan, item, box, dragView, handlers }: SegmentProps) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const point = item.from === item.to;
  const buttonClass = point ? "timeline-marker" : item.track === "background" ? "timeline-strip" : "timeline-bar";
  const lifted = dragView?.liftedId === item.blockId;
  const time = zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date);

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
      <BlockButton blockId={item.blockId} name={`${block.title} ${time}`} className={buttonClass}>
        {point ? null : block.title}
      </BlockButton>
    </div>
  );
}

function horizontal(item: PlacedSegment): CSSProperties {
  return { left: percent(item.from), width: percent(item.to - item.from) };
}
