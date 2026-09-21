import type { BaseView, BlockView, LibraryView, PlanView, StatsFilter } from "@welshonion/core";
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import type * as Y from "yjs";
import { useWideScreen } from "../app/use-wide-screen";
import { AddAtTime } from "./AddAtTime";
import { TimelineAddBlock } from "./AddBlock";
import { blockTimeLabel, durationLabel } from "./block-time";
import { useDayMenu } from "./day-menu";
import { PhoneTimeline } from "./PhoneTimeline";
import { DragLabel } from "./DragLabel";
import { dayRowLabels } from "./day-labels";
import { BlockMoney } from "./block-money";
import type { MoneyCell } from "./money-cells";
import { Popover } from "../app/Popover";
import { PlusIcon } from "./icons";
import { QuickBar } from "./QuickBar";
import { BlockButton, useBlockSelection } from "./select-block";
import { kindColor } from "./timeline-draw";
import {
  barZones,
  GAP,
  LIFTED_Z_INDEX,
  planHasBarTags,
  QUICK_BAR_ROW_PX,
  wideAxisHeight,
  wideMetrics,
  wideSegmentBox,
  wideStripsHeight,
  type BarZones,
  type BlockText,
  type WideMetrics,
} from "./timeline-geometry";
import { layoutRow, timelineSegments, type PlacedSegment, type RowLayout } from "./timeline-layout";
import {
  axisOffset,
  axisPixel,
  foldWidths,
  hourLines,
  hourTicks,
  offsetCss,
  spanOffset,
  type HourWindow,
} from "./timeline-window";
import { UndatedStrip } from "./UndatedTray";
import { blankPieceInRow, type MinuteRange } from "./timeline-drag";
import {
  isBlankPress,
  useTimelineDrag,
  type BlankHandlers,
  type BlankRange,
  type CopyHandlers,
  type DragView,
  type SegmentHandlers,
} from "./use-timeline-drag";
import { zoneTimeLabel } from "./zone-time";

/** 每行两栏：钉住的第一列（日期、这天的菜单、加一件事）和 0–24 点的横轴 */
const ROW_COLUMNS = "grid grid-cols-[6.5rem_1fr] gap-x-3";
/** 第一列：横向滚动时钉在左边，底色盖住从下面滚过去的横条 */
// 钉住的第一列：往左盖住卡片那 8 像素的内边距（横向滚的块会画到那儿），自己再用 pl-2 把字推回原位
const FIRST_COLUMN = "sticky -left-2 z-10 -ml-2 bg-white/85 pl-2 backdrop-blur-[2px]";

/** 「条上写」的两个选项 */
interface TimelineProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  /** 筛选；没开是 undefined */
  filter?: StatsFilter;
  /** 每件事的开销格摘要（按筛选算过）：快捷条上的「开销」、条上写的开销用 */
  moneyCells: Map<string, MoneyCell>;
  /** 条上写标题、开销（各开各关） */
  blockText: BlockText;
  /** 横向放到百分之几（横排才有） */
  zoom: number;
  /** 手机上整条时间线放大几倍（双指捏合），和电脑的横向放大分开记 */
  phoneZoom: number;
  onPhoneZoom: (zoom: number) => void;
  /** 横条上的标题写几行（横排才有） */
  titleLines: number;
  /** 横排横轴展开的那段：没事的凌晨和深夜折起（按计划算，见 timeline-window） */
  hours: HourWindow;
  /** 点了折起的那一截：展开成 0–24 点 */
  onExpandHours: () => void;
  /** 手机上展开的是哪天（底座 id）：DayList 记着，切到日程再切回来还是这天 */
  shownDay: { current: string | null };
  /** 搜索里点了一条：手机上展开那天（seq 变了才算一次新的） */
  jump: { baseId: string; seq: number } | null;
}

/**
 * 时间线：一天一行横着铺。屏幕够宽时每行写字、能拖（见 use-timeline-drag）；窄屏上是精简版，色块不写字、点开某天才列名字（见 PhoneTimeline）。
 * 两种都用同一份几何：每个块画在哪几行、一行里分到哪一道。点一件事选中它、旁边出快捷条；每天有「加一件事」和「这天的操作」。
 */
export function Timeline({
  doc,
  library,
  plan,
  libraryView,
  filter,
  moneyCells,
  blockText,
  zoom,
  phoneZoom,
  onPhoneZoom,
  titleLines,
  hours,
  onExpandHours,
  shownDay,
  jump,
}: TimelineProps) {
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
  // 「加第一件事」：电脑上点开第 1 天那一行的「＋」（弹出的框自己拿焦点）；
  // 手机上给展开那天的框焦点，一天都没展开（框不在）就先展开第 1 天，画完再给焦点
  const focusFirstAdd = () => {
    const add = section.current!.querySelector<HTMLButtonElement>('button[aria-label="加一件事"]');
    if (add !== null) {
      add.scrollIntoView({ block: "center" });
      add.click();
      return;
    }
    const input = section.current!.querySelector<HTMLInputElement>('input[aria-label="加一件事"]');
    if (input === null) {
      section.current!.querySelector<HTMLButtonElement>("li button[aria-expanded]")!.click();
      requestAnimationFrame(focusFirstAdd);
      return;
    }
    input.scrollIntoView({ block: "center" });
    input.focus({ preventScroll: true });
  };

  return (
    <section ref={section} aria-label="时间线" className="glass-card flex flex-col gap-2 px-5 py-3 select-none">
      {/* 卡片名不写出来：上面「时间线」那个 tab 按着呢，读屏名在 section 的 aria-label 上 */}
      {plan.blocks.size === 0 ? (
        // 一件事都没有：栏是空的，栏下面的「加一件事」不显眼，直接给个按钮
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p className="text-sm text-ink-muted">还没有事。加了事、排上时间，就会画在这里</p>
          <button type="button" className="btn btn-primary" onClick={focusFirstAdd}>
            加第一件事
          </button>
        </div>
      ) : (
        // 手机上没排时间的事在展开那天的下面
        !hasTimed && (
          <p className="text-sm text-ink-muted">
            {wide
              ? "排上时间的事会画在这里：把上面没排时间的事拖到时间线上，或者点开它排时间"
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
          moneyCells={moneyCells}
          blockText={blockText}
          zoom={zoom}
          titleLines={titleLines}
          hours={hours}
          onExpandHours={onExpandHours}
        />
      ) : (
        <PhoneTimeline
          doc={doc}
          library={library}
          plan={plan}
          libraryView={libraryView}
          rows={rows}
          labels={labels}
          filter={filter}
          moneyCells={moneyCells}
          blockText={blockText}
          shownDay={shownDay}
          jump={jump}
          zoom={phoneZoom}
          onZoom={onPhoneZoom}
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
  moneyCells: Map<string, MoneyCell>;
  blockText: BlockText;
  zoom: number;
  titleLines: number;
  hours: HourWindow;
  onExpandHours: () => void;
}

/**
 * 横排：一天一行，横向按真实比例画这趟用得着的钟点（没事的凌晨和深夜折成两头窄窄的一截，见 timeline-window）；上面横着一条「没排时间」，第一列（日期、这天的菜单、加一件事）钉在左边。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条选中它。
 * 拖动中画成松手后的样子，「没排时间」条照原来的计划（见 use-timeline-drag）。
 */
function WideTimeline({
  doc,
  library,
  plan,
  libraryView,
  rows,
  labels,
  filter,
  moneyCells,
  blockText,
  zoom,
  titleLines,
  hours,
  onExpandHours,
}: WideTimelineProps) {
  const selection = useBlockSelection();
  // 块分上中下三区：按拖之前的计划算，拖一件挂着标签的事进时间线时版面不在拖动中跳
  const zones = barZones(blockText, titleLines, planHasBarTags(plan, libraryView));
  const metrics = wideMetrics(zones);
  // 在空白处点了、拖出了一段：画着虚线框，贴着它弹「加一件事」；框关掉就没了
  const [adding, setAdding] = useState<BlankRange | null>(null);
  const [ghost, setGhost] = useState<HTMLDivElement | null>(null);
  const addingBase = adding === null ? undefined : plan.bases[adding.row];
  // 框开着时那一天被删了：关掉
  if (adding !== null && addingBase === undefined) setAdding(null);
  // 拖完选中拖的那一件（复制着拖的是复制出来的那一份）
  const drag = useTimelineDrag({
    doc,
    library,
    plan,
    libraryView,
    rows,
    filter,
    metrics,
    hours,
    onDropped: (blockId) => selection.select(blockId, null),
    onBlankRange: setAdding,
  });
  // 正在拖出的一段先画；拖完弹框时画框贴着的那一段
  const newRange = drag.blankRange ?? adding;
  // 跨天的一段每一行画自己那一截，时间只写在开始那一行上（「22:00–10.2 02:00」）
  const newRangeLabel =
    newRange === null || plan.bases[newRange.row] === undefined
      ? null
      : blockTimeLabel(
          { start_minute: newRange.from, duration_min: newRange.to - newRange.from, slot: null },
          plan.bases[newRange.row]!.date,
        );
  const shownPlan = drag.dropped?.plan ?? plan;
  const shownRows = drag.dropped?.rows ?? rows;
  // 选中的那件旁边出快捷条；拖动中不画
  const selectedBlock = drag.dragView || selection.selectedId === null ? undefined : plan.blocks.get(selection.selectedId);
  const barRow = selectedBlock === undefined ? -1 : quickBarRow(selectedBlock, rows, plan, selection.anchorBaseId);

  const selectedUndated = selectedBlock !== undefined && selectedBlock.start_minute === null ? selectedBlock : null;
  const quickBarFor = (block: BlockView) => (
    <QuickBar
      doc={doc}
      library={library}
      libraryView={libraryView}
      plan={plan}
      block={block}
      moneyCell={moneyCells.get(block.id)}
      copyHandlers={drag.copyHandlers}
    />
  );

  return (
    <div ref={drag.containerRef} className="relative flex flex-col gap-1">
      {/* 「没排时间」在时间线上面横着一条（你提的）：一件都没有时整条不出现 */}
      <UndatedStrip
        // 条用现在的计划画：拖动中被拖的那一件留在条上、变淡，松手后才拿走
        plan={plan}
        filter={filter}
        trayRef={drag.trayRef}
        dropLabel={drag.trayDrop?.label ?? null}
        draggingId={drag.dragView && !drag.dragView.copying ? drag.dragView.blockId : null}
        onChipPointerDown={(event: ReactPointerEvent<HTMLDivElement>, blockId: string) =>
          drag.chipHandlers.onPointerDown(event, blockId, 0)
        }
        onChipClickCapture={drag.chipHandlers.onClickCapture}
        quickBar={selectedUndated === null ? undefined : quickBarFor(selectedUndated)}
        showWhenEmpty={drag.dragView !== null && plan.blocks.get(drag.dragView.blockId)?.start_minute !== null}
      />
      {/* 横轴至少 720 像素（每小时 30 像素），放不下就在卡片里横着滚 */}
      <div
        data-timeline-scroll
        data-timeline-dragging={drag.dragView ? true : undefined}
        className="-mx-2 overflow-x-auto px-2"
        style={{ paddingBottom: QUICK_BAR_ROW_PX }}
      >
      {/* 横轴至少 62rem（每小时 30 像素），放大就按倍数加宽 */}
      <div className="pr-3" style={{ minWidth: `${(62 * zoom) / 100}rem` }}>
        <div aria-hidden className={ROW_COLUMNS}>
          <span className={FIRST_COLUMN} />
          <div className="relative h-4">
            <FoldBands hours={hours} onExpand={onExpandHours} />
            {hourTicks(hours).map((hour) => (
              <span
                key={hour}
                data-hour-tick
                // 最右的「24」右对齐到 24 点那条线
                className={`pointer-events-none absolute ${hour === 24 ? "-translate-x-full" : "-translate-x-1/2"} text-[11px] leading-4 text-ink-muted tabular-nums`}
                style={{ left: offsetCss(axisOffset(hours, hour * 60)) }}
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
              doc={doc}
              library={library}
              rowRef={drag.rowRef(index)}
              axisRef={drag.axisRef(index)}
              plan={shownPlan}
              currentPlan={plan}
              base={base}
              label={labels[index]!}
              index={index}
              layout={shownRows[index]!}
              filter={filter}
              dragView={drag.dragView}
              handlers={drag.handlers}
              libraryView={libraryView}
              moneyCells={moneyCells}
              blockText={blockText}
              metrics={metrics}
              zones={zones}
              hours={hours}
              onExpandHours={onExpandHours}
              quickBarBlock={index === barRow && selectedUndated === null ? selectedBlock! : null}
              copyHandlers={drag.copyHandlers}
              newRange={newRange === null ? null : blankPieceInRow(newRange, index)}
              newRangeLabel={newRange?.row === index ? newRangeLabel : null}
              ghostRef={newRange?.row === index ? setGhost : undefined}
              blankHandlers={drag.blankHandlers}
            />
          ))}
        </ol>
        </div>
      </div>
      {drag.pointerLabel && <DragLabel label={drag.pointerLabel} />}
      {adding !== null && addingBase !== undefined && ghost !== null && (
        <AddAtTime
          doc={doc}
          library={library}
          plan={plan}
          filter={filter}
          baseId={addingBase.id}
          label={labels[adding.row]!}
          range={adding}
          anchor={ghost}
          onClose={() => setAdding(null)}
          onAdded={(blockId) => {
            setAdding(null);
            selection.select(blockId, addingBase.id);
          }}
        />
      )}
    </div>
  );
}

interface TimelineRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  rowRef: (element: HTMLLIElement | null) => void;
  axisRef: (element: HTMLDivElement | null) => void;
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
  handlers: SegmentHandlers;
  libraryView: LibraryView;
  moneyCells: Map<string, MoneyCell>;
  blockText: BlockText;
  /** 主轨每道多高、套在里面的往下让多少（像素） */
  metrics: WideMetrics;
  /** 横条分哪几区 */
  zones: BarZones;
  hours: HourWindow;
  onExpandHours: () => void;
  /** 快捷条画在这一行时，是哪一件事；不画是 null */
  quickBarBlock: BlockView | null;
  copyHandlers: CopyHandlers;
  /** 在这一行空白处拖出的、弹「加一件事」贴着的那一段；没有是 null */
  newRange: MinuteRange | null;
  newRangeLabel: string | null;
  ghostRef: ((element: HTMLDivElement | null) => void) | undefined;
  blankHandlers: BlankHandlers;
}

function TimelineRow({
  doc,
  library,
  rowRef,
  axisRef,
  plan,
  currentPlan,
  base,
  label,
  index,
  layout,
  filter,
  dragView,
  handlers,
  libraryView,
  moneyCells,
  blockText,
  metrics,
  zones,
  hours,
  onExpandHours,
  quickBarBlock,
  copyHandlers,
  newRange,
  newRangeLabel,
  ghostRef,
  blankHandlers,
}: TimelineRowProps) {
  const [dayNumber, ...rest] = label.split(" · ");
  // 排上时间的：快捷条贴着这一行里它那一段的右下角；没排时间的：画在栏里它自己下面
  const barSegment =
    quickBarBlock === null || quickBarBlock.start_minute === null
      ? undefined
      : [...layout.main, ...layout.background].find((item) => item.blockId === quickBarBlock.id);
  const quickBar = quickBarBlock && (
    <QuickBar
      doc={doc}
      library={library}
      libraryView={libraryView}
      plan={currentPlan}
      block={quickBarBlock}
      moneyCell={moneyCells.get(quickBarBlock.id)}
      copyHandlers={copyHandlers}
    />
  );
  // 标签那一栏窄：菜单按钮做小，放在「第 1 天」后面；展开的表单占满整行，在这一行下面
  const dayMenu = useDayMenu({
    doc,
    library,
    libraryView,
    plan: currentPlan,
    base,
    label,
    index,
    count: currentPlan.bases.length,
    filter,
    triggerClassName: "btn btn-ghost h-6 px-1.5",
  });

  return (
    <li ref={rowRef} aria-label={label} data-base-id={base.id} className={`${ROW_COLUMNS} border-t border-ink/5 py-1.5`}>
      <div data-day-column className={`${FIRST_COLUMN} flex flex-col text-xs leading-4 text-ink-muted tabular-nums`}>
        {/* 「第 1 天」和这天的两个按钮挤一行、日期单独一行：一道的块才 28 像素高，这一列不能比它高太多 */}
        <div className="flex items-center gap-0.5">
          <span aria-hidden className="text-ink">
            {dayNumber}
          </span>
          {dayMenu.menu}
          <Popover
            label="加一件事"
            triggerTitle="加一件事"
            trigger={<PlusIcon />}
            triggerClassName="btn btn-ghost h-6 px-1.5"
            role="dialog"
            panelLabel="加一件事"
            panelClassName="menu p-2"
            align="start"
            estimatedHeight={72}
          >
            {() => (
              <TimelineAddBlock
                doc={doc}
                library={library}
                plan={currentPlan}
                baseId={base.id}
                filter={filter}
                className="input-bare h-7 w-44 px-2 text-sm select-text"
              />
            )}
          </Popover>
        </div>
        {rest.map((part) => (
          <span key={part} aria-hidden>
            {part}
          </span>
        ))}
      </div>
      <div
        ref={axisRef}
        data-timeline-axis
        // 走查按这两个数换算位置
        data-window-from={hours.from}
        data-window-to={hours.to}
        className="relative"
        // 快捷条浮在上面、不占这一行的高度（你提的：选中不该把下面的时间线顶下去）
        style={{ minHeight: wideAxisHeight(layout, metrics) }}
        // 空白处点一下、按住拖：加一件事
        onPointerDown={(event) => {
          if (isBlankPress(event.target)) blankHandlers.onPointerDown(event, index);
        }}
      >
        {hourLines(hours).map((hour) => (
          <div
            key={hour}
            aria-hidden
            className={`absolute inset-y-0 w-px ${hour % 6 === 0 ? "bg-ink/12" : "bg-ink/5"}`}
            style={{ left: offsetCss(axisOffset(hours, hour * 60)) }}
          />
        ))}
        <FoldBands hours={hours} onExpand={onExpandHours} />
        {layout.background.map((item) => (
          <div
            key={`wash-${item.blockId}`}
            aria-hidden
            className="timeline-wash absolute bottom-0"
            style={{ ...horizontal(item, hours), top: wideStripsHeight(layout), ...kindColor(plan, item.blockId) }}
          />
        ))}
        {[...layout.background, ...layout.main].map((item) => (
          <Segment
            key={`${item.track}-${item.blockId}`}
            doc={doc}
            library={library}
            libraryView={libraryView}
            plan={plan}
            item={item}
            box={wideSegmentBox(item, layout, metrics)}
            zones={zones}
            hours={hours}
            showTitle={blockText.title}
            showDuration={blockText.duration && item.track === "main"}
            showMoney={blockText.money && item.track === "main"}
            money={moneyCells.get(item.blockId)}
            dragView={dragView}
            handlers={handlers}
          />
        ))}
        {newRange && (
          <div
            ref={ghostRef}
            data-new-range
            className="timeline-new-range absolute inset-y-0"
            style={{
              left: offsetCss(axisOffset(hours, newRange.from)),
              width: offsetCss(spanOffset(hours, newRange.from, newRange.to)),
            }}
          >
            {newRangeLabel}
          </div>
        )}
        {barSegment && (
          <QuickBarAnchor
            key={barSegment.blockId}
            to={barSegment.to}
            hours={hours}
            top={wideAxisHeight(layout, metrics) + GAP}
          >
            {quickBar}
          </QuickBarAnchor>
        )}
      </div>
      {dayMenu.form !== null && <div className="col-span-2 py-1.5 select-text">{dayMenu.form}</div>}
    </li>
  );
}

interface SegmentProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  item: PlacedSegment;
  /** 这一段在横轴里的上边和高度 */
  box: { top: number; height: number };
  /** 主轨横条分哪几区（背景细条、时长为 0 的竖线不分区） */
  zones: BarZones;
  /** 块上要不要写标题 */
  showTitle: boolean;
  /** 块上要不要写时长 */
  showDuration: boolean;
  /** 块上要不要写开销 */
  showMoney: boolean;
  /** 这件事的开销格摘要（按筛选算过） */
  money: MoneyCell | undefined;
  hours: HourWindow;
  dragView: DragView | null;
  handlers: SegmentHandlers;
}

/**
 * 一段横条：外框放位置、data 属性和拖拽的监听，里面的按钮点一下选中。
 * 主轨的横条分上中下三区（你提的）：上面书签栏挂着标签的书签（靠右），中间标题（写几行由拉动条定），
 * 最下面附件栏写时长和开销（靠右，开销在最右；从右往左排，所以先开销后时长）。附件栏在按钮外面：开销能点，按钮里不能再放按钮。
 */
function Segment({
  doc,
  library,
  libraryView,
  plan,
  item,
  box,
  zones,
  showTitle,
  showDuration,
  showMoney,
  money,
  hours,
  dragView,
  handlers,
}: SegmentProps) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const point = item.from === item.to;
  const bar = !point && item.track === "main";
  const buttonClass = point ? "timeline-marker" : item.track === "background" ? "timeline-strip" : "timeline-bar";
  const lifted = dragView?.liftedId === item.blockId;
  const time = zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date);
  const duration = showDuration && block.duration_min !== null ? durationLabel(block.duration_min) : null;

  return (
    <div
      data-segment
      data-block-id={item.blockId}
      data-from={item.from}
      data-to={item.to}
      data-track={item.track}
      data-lane={item.lane}
      data-depth={item.depth}
      data-mark={block.mark}
      data-continues-before={item.continuesBefore}
      data-continues-after={item.continuesAfter}
      data-lifted={lifted ? true : undefined}
      // 三区里有哪几区：按钮上下留多少由 index.css 照这两个属性定
      data-tag-bar={bar && zones.tagBar ? true : undefined}
      data-foot={bar && zones.foot ? true : undefined}
      // 指针在「没排时间」栏里时时间线不重排：被拖的横条留在原处变淡
      data-dragging={
        dragView && dragView.liftedId === null && !dragView.copying && dragView.blockId === item.blockId ? true : undefined
      }
      data-follower={dragView?.followers.includes(item.blockId) ? true : undefined}
      data-drop-target={dragView?.ontoId === item.blockId ? true : undefined}
      className="absolute"
      // 缩得越深的画得越靠上：谁压谁不看在页面里的先后；拿起来的块压在最上面
      style={{
        ...horizontal(item, hours),
        ...box,
        zIndex: lifted ? LIFTED_Z_INDEX : 1 + item.depth,
        ...kindColor(plan, item.blockId),
        ...(bar ? ({ "--title-lines": String(zones.lines) } as CSSProperties) : {}),
      }}
      onPointerDown={(event) => handlers.onPointerDown(event, item)}
      onPointerMove={(event) => handlers.onPointerMove(event, item)}
      onClickCapture={handlers.onClickCapture}
    >
      <BlockButton
        blockId={item.blockId}
        name={`${block.title} ${time}`}
        tags={block.tags}
        tagMarks={!point}
        mark={block.mark}
        className={buttonClass}
      >
        {/* 写不下就换行，写满行数还放不下截断加「…」（鼠标停上去的提示里有全名）；细条只写一行 */}
        {point || !showTitle ? null : <span data-bar-title>{block.title}</span>}
      </BlockButton>
      {bar && zones.foot && (
        <span data-bar-foot className="timeline-foot">
          {showMoney && (
            <BlockMoney
              variant="line"
              doc={doc}
              library={library}
              libraryView={libraryView}
              plan={plan}
              block={block}
              moneyCell={money}
            />
          )}
          {duration !== null && <span data-bar-duration>{duration}</span>}
        </span>
      )}
    </div>
  );
}

function horizontal(item: PlacedSegment, hours: HourWindow): CSSProperties {
  return { left: offsetCss(axisOffset(hours, item.from)), width: offsetCss(spanOffset(hours, item.from, item.to)) };
}

interface FoldBandsProps {
  hours: HourWindow;
  onExpand: () => void;
}

/**
 * 折起的那一截：斜纹，折起的钟点按比例压在里面（住宿这类背景条照样画进来）。点了展开成 0–24 点：
 * 给鼠标和手指的捷径，读屏和 Tab 走视图那一行的「0–24 点」按钮。
 */
function FoldBands({ hours, onExpand }: FoldBandsProps) {
  const { before, after } = foldWidths(hours);
  return (
    <>
      {before > 0 && (
        <div
          aria-hidden
          data-fold="before"
          title={`展开 0–${hours.from / 60} 点`}
          className="timeline-fold absolute inset-y-0 left-0"
          style={{ width: before }}
          onClick={onExpand}
        />
      )}
      {after > 0 && (
        <div
          aria-hidden
          data-fold="after"
          title={`展开 ${hours.to / 60}–24 点`}
          className="timeline-fold absolute inset-y-0 right-0"
          style={{ width: after }}
          onClick={onExpand}
        />
      )}
    </>
  );
}

/** 快捷条画在哪一行：排上时间的贴点的那一段（跨午夜的点哪一段贴哪一段），点的那一行不在了就找第一段；没排时间的在它那天。 */
function quickBarRow(block: BlockView, rows: readonly RowLayout[], plan: PlanView, anchorBaseId: string | null): number {
  if (block.start_minute === null) return plan.bases.findIndex((base) => base.id === block.start_base_id);
  const drawn = (row: number) => [...rows[row]!.background, ...rows[row]!.main].some((item) => item.blockId === block.id);
  const anchor = plan.bases.findIndex((base) => base.id === anchorBaseId);
  if (anchor >= 0 && drawn(anchor)) return anchor;
  return rows.findIndex((_, row) => drawn(row));
}

interface QuickBarAnchorProps {
  /** 贴着这一段的结束分钟（右边对齐它） */
  to: number;
  hours: HourWindow;
  /** 在横轴里的上边（像素） */
  top: number;
  children: ReactNode;
}

/** 把快捷条摆在这一段的右下角：右边对齐这一段，伸出横轴左右边时贴着边放（横轴的宽度按 DOM 量）。 */
function QuickBarAnchor({ to, hours, top, children }: QuickBarAnchorProps) {
  const box = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(0);
  useLayoutEffect(() => {
    const element = box.current;
    const axis = element?.parentElement;
    if (!element || !axis) return;
    const axisWidth = axis.getBoundingClientRect().width;
    const width = element.getBoundingClientRect().width;
    const right = axisPixel(hours, to, axisWidth);
    setLeft(Math.max(0, Math.min(right - width, axisWidth - width)));
  }, [to, hours]);
  return (
    <div ref={box} className="absolute z-20" style={{ top, left }}>
      {children}
    </div>
  );
}
