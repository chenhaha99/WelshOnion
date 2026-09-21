import { baseStartUtcMs, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type * as Y from "yjs";
import { snapTick } from "../app/haptics";
import { useNow, useTimeZone } from "../app/services";
import { TimelineAddBlock } from "./AddBlock";
import { blockTimeLabel, durationLabel } from "./block-time";
import { useDayMenu } from "./day-menu";
import { DragLabel } from "./DragLabel";
import { useNoticeShown } from "./DoneNotice";
import { moneyCellEmpty, moneyCellLabel, type MoneyCell } from "./money-cells";
import { QuickBar } from "./QuickBar";
import { todayIn } from "./day-labels";
import { kindColor } from "./timeline-draw";
import type { BlockText } from "./timeline-geometry";
import type { PlacedSegment, RowLayout } from "./timeline-layout";
import { makeMeasure, packLabels, type LabelInput } from "./timeline-labels";
import { anchoredScroll, pinchZoom } from "./phone-zoom";
import { axisOffset, foldWidths, hourLines, hourWindow, offsetCss, spanOffset, type HourWindow } from "./timeline-window";
import { UndatedTray, undatedBlocks } from "./UndatedTray";
import { BlockButton, useBlockSelection } from "./select-block";
import { useTimelineDrag, type DragView, type HandleHandlers, type SegmentHandlers } from "./use-timeline-drag";
import { zoneTimeLabel } from "./zone-time";

/** 没展开的那些天，一条多高（像素） */
const THIN = 16;
/** 展开那天一道多高、整条至少多高（像素） */
const LANE = 13;
const FAT = 30;
/** 条下面一行字多高（像素） */
const ROW_H = 14;
/** 右边角标那一格连同前面的空隙多宽（像素），和 .phone-undated-slot 对上。
 * 条下面那几行字可以用到这一格：那一格只有条那一行有东西，下面是空的 */
const SLOT = 26;
/** 左边写哪天那一列连同后面的空隙多宽（像素），和 index.css 的 --phone-gut 对上 */
const GUT = 42;
/** 量字用的字号，和 .phone-tag 的 font-size 对上 */
const LABEL_FONT = '10px system-ui, -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif';

interface PhoneTimelineProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  /** 每一行摆好的横条（已经按筛选算过），和电脑上共用 */
  rows: readonly RowLayout[];
  /** 每一行的标签：「第 1 天 · 10.1 周四」 */
  labels: readonly string[];
  filter: StatsFilter | undefined;
  /** 每件事的开销格摘要（按筛选算过）：快捷条上的「开销」、条下面那几行的金额用 */
  moneyCells: Map<string, MoneyCell>;
  /** 「条上写」开着哪几样：手机上管展开那天条下面那几行写什么 */
  blockText: BlockText;
  /** 展开的是哪天（底座 id），记在 DayList 里：切到日程时这里卸掉，切回来还是这天 */
  shownDay: { current: string | null };
  /** 搜索里点了一条、总览里点了一天：展开那天（seq 变了才算一次新的） */
  jump: { baseId: string; seq: number } | null;
  /** 整条时间线放大几倍（1 是整趟一屏）；双指捏合、「看全部」改它 */
  zoom: number;
  onZoom: (zoom: number) => void;
}

/**
 * 手机竖屏上的时间线：**一天一条横的，整趟的天竖着堆起来**，时间轴按整趟跨度自动收，双指捏合整条放大缩小（放大后左右滚）。
 *
 * 和电脑上是同一个结构（一天一行、横轴是时间、块按左右定位），只是窄一点。
 * 曾经是竖排、一次一天、纵轴 0–24 点，2026-09-21 改掉——**你提的**，原话
 * 「竖屏，时间变成垂直了……感觉就和日程模式是一样的，而且还没日程模式好」：
 * 竖过来以后和日程撞了形状（都是一次一天、从上往下一列），时间线「时长画成宽度」的立身之本也没了。
 *
 * 分工：时间线管「整趟什么形状」（哪天满、哪天空），日程管「这一天具体有什么、能改」。
 * 所以**色块上一个字都不写**，点开某一天才在条下面列出名字。
 */
export function PhoneTimeline({
  doc,
  library,
  plan,
  libraryView,
  rows,
  labels,
  filter,
  moneyCells,
  blockText,
  shownDay,
  jump,
  zoom,
  onZoom,
}: PhoneTimelineProps) {
  const selection = useBlockSelection();
  const timeZone = useTimeZone();
  const now = useNow();
  const today = todayIn(now(), timeZone);
  // 展开哪天：切回来接着展开上次那天；第一次打开见 firstOpenDay
  const [open, setShownOpen] = useState(() => {
    const remembered = plan.bases.findIndex((base) => base.id === shownDay.current);
    return remembered >= 0 ? remembered : firstOpenDay(plan.bases, today);
  });
  const setOpen = (index: number) => {
    setShownOpen(index);
    shownDay.current = plan.bases[index]?.id ?? null;
  };
  // 搜索里点了一条、总览里点了一天：在这一次画的时候就展开那天——DayList 画完要找那天的「这天的操作」、那件事的块
  const [seenJump, setSeenJump] = useState(jump?.seq ?? 0);
  if (jump !== null && jump.seq !== seenJump) {
    setSeenJump(jump.seq);
    const target = plan.bases.findIndex((base) => base.id === jump.baseId);
    if (target >= 0) setOpen(target);
  }
  const axis = useRef<HTMLDivElement>(null);
  const [trackWidth, setTrackWidth] = useState(0);

  // 排字要知道条有多宽：量出来，宽度变了重排
  useLayoutEffect(() => {
    const node = axis.current;
    if (node === null) return;
    const observer = new ResizeObserver(() => setTrackWidth(node.clientWidth));
    observer.observe(node);
    setTrackWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  const measure = useMemo(() => makeMeasure(LABEL_FONT), []);

  // 缩放（你提的：整体放大缩小，像电脑上的百分比）：放大的是横轴那一截，外面一层左右滚，「第 N 天」那一列钉在左边
  const scroller = useRef<HTMLDivElement>(null);
  const [viewWidth, setViewWidth] = useState(0);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    const observer = new ResizeObserver(() => setViewWidth(node.clientWidth));
    observer.observe(node);
    setViewWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  /** 1 倍时横轴多宽：可见宽度减去左边那一列和右边角标那一格 */
  const baseAxis = Math.max(viewWidth - GUT - SLOT, 0);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  const baseAxisRef = useRef(baseAxis);
  baseAxisRef.current = baseAxis;
  /** 捏合改了倍数：画完以后按它滚，两指中间那个钟点留在原处 */
  const anchor = useRef<{ focusX: number; scrollLeft: number; oldWidth: number } | null>(null);
  useLayoutEffect(() => {
    const node = scroller.current;
    const pending = anchor.current;
    anchor.current = null;
    if (node === null || pending === null) return;
    node.scrollLeft = anchoredScroll({ ...pending, gutter: GUT, newWidth: baseAxis * zoom });
  }, [zoom, baseAxis]);
  // 双指捏合：照 iMovie、Final Cut Pro for iPad，不显示百分比。一根手指照常滚，两根手指才拦下浏览器自己的缩放
  const onZoomRef = useRef(onZoom);
  onZoomRef.current = onZoom;
  useEffect(() => {
    const node = scroller.current;
    if (node === null) return;
    let pinch: { distance: number; zoom: number; focusX: number } | null = null;
    const spread = (touches: TouchList) =>
      Math.hypot(touches[0]!.clientX - touches[1]!.clientX, touches[0]!.clientY - touches[1]!.clientY);
    const onStart = (event: TouchEvent) => {
      if (event.touches.length !== 2) return;
      const middle = (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2;
      pinch = { distance: spread(event.touches), zoom: zoomRef.current, focusX: middle - node.getBoundingClientRect().left };
    };
    const onMove = (event: TouchEvent) => {
      if (pinch === null || event.touches.length !== 2) return;
      event.preventDefault();
      const next = pinchZoom(pinch.zoom, pinch.distance, spread(event.touches));
      if (next === zoomRef.current) return;
      anchor.current = { focusX: pinch.focusX, scrollLeft: node.scrollLeft, oldWidth: baseAxisRef.current * zoomRef.current };
      onZoomRef.current(next);
    };
    const onEnd = (event: TouchEvent) => {
      if (event.touches.length < 2) pinch = null;
    };
    node.addEventListener("touchstart", onStart, { passive: true });
    node.addEventListener("touchmove", onMove, { passive: false });
    node.addEventListener("touchend", onEnd);
    node.addEventListener("touchcancel", onEnd);
    return () => {
      node.removeEventListener("touchstart", onStart);
      node.removeEventListener("touchmove", onMove);
      node.removeEventListener("touchend", onEnd);
      node.removeEventListener("touchcancel", onEnd);
    };
  }, []);
  const zoomed = zoom > 1 && baseAxis > 0;

  // 画哪几个钟点：整趟共用一把尺（不共用就没法比），前一天延续过来的那一截不撑开它
  const hours = useMemo(() => hourWindow(plan, libraryView, false, { foldTails: true }), [plan, libraryView]);

  // 拖（照 iMovie：长按到块浮起再拖、选中后拖两端把手）：只有展开那天的块接（你提的：展开「只是作为防止误触」）。
  // 不判叠上去（metrics 给 null，一律放旁边）；吸到别的事的边上轻震一下；放大后拖到左右边外面那层自己滚
  const drag = useTimelineDrag({
    doc,
    library,
    plan,
    libraryView,
    rows,
    filter,
    metrics: null,
    hours,
    onDropped: (blockId) => selection.select(blockId, null),
    onSnap: snapTick,
    edgeScroller: scroller,
  });
  const shownPlan = drag.dropped?.plan ?? plan;
  const shownRows = drag.dropped?.rows ?? rows;
  const folds = foldWidths(hours);

  // 拖动中不画快捷条
  const selectedBlock = drag.dragView || selection.selectedId === null ? undefined : plan.blocks.get(selection.selectedId);
  const noticeShown = useNoticeShown();
  // 展开的那天被删了（天数变少了）：回到第一天。-1 是一天都没展开，不算
  if (open >= plan.bases.length && plan.bases.length > 0) setOpen(0);

  return (
    <div ref={drag.containerRef} className="phone-timeline" data-timeline-dragging={drag.dragView ? true : undefined}>
      {/* 放大以后一点回到整趟一屏（代替 LumaFusion 的点两下：我们点一下是展开那天，点两下容易误触） */}
      {zoom > 1 && (
        <button
          type="button"
          className="phone-fit"
          onClick={() => {
            anchor.current = null;
            if (scroller.current !== null) scroller.current.scrollLeft = 0;
            onZoom(1);
          }}
        >
          看全部
        </button>
      )}
      <div
        ref={scroller}
        data-phone-scroll
        data-zoom={zoom}
        data-zoomed={zoomed ? true : undefined}
        className="phone-scroll"
        style={{ "--phone-view": `${viewWidth}px` } as CSSProperties}
      >
        <div style={zoomed ? { width: GUT + baseAxis * zoom + SLOT } : undefined}>
          {/* 钟点刻度：整趟共用，放大时跟着一起滚 */}
          <div className="phone-axis">
            {/* 刻度下面那条和条一样宽：右边也留出角标那一格 */}
            {hourLines(hours)
              // 放大到 3 倍以上一小时有 40 像素，每个钟点都写得下
              .filter((hour) => hour % (zoom >= 3 ? 1 : 3) === 0)
              .map((hour) => (
                <span key={hour} style={{ left: offsetCss(axisOffset(hours, hour * 60)) }}>
                  {String(hour).padStart(2, "0")}
                </span>
              ))}
          </div>
          <ol aria-label="每天">
            {plan.bases.map((base, index) => {
              const layout = shownRows[index]!;
              const on = index === open;
              const undated = undatedBlocks(plan, base, filter).length;
              const [dayNumber, date] = labels[index]!.split(" · ");
              const laneCount = Math.max(layout.laneCount, 1);
              const height = on ? Math.max(FAT, laneCount * LANE + 2) : THIN;
              return (
                <li
                  key={base.id}
                  ref={drag.rowRef(index)}
                  aria-label={labels[index]}
                  data-base-id={base.id}
                  data-open={on ? true : undefined}
                >
                  <div className="phone-day">
                    <button
                      type="button"
                      aria-expanded={on}
                      className="phone-day-name"
                      onClick={() => setOpen(on ? -1 : index)}
                    >
                      {/* 「第 1 天」「10.1」两行；星期不写，那一列只有 42 像素，写了就换行 */}
                      <span>{dayNumber}</span>
                      {date !== undefined && <span className="phone-day-date">{date.replace(/\s*周.$/, "")}</span>}
                    </button>
                    <div
                      ref={(element) => {
                        drag.axisRef(index)(element);
                        if (index === 0) axis.current = element;
                      }}
                      className="phone-track"
                      style={{ height }}
                      // 没展开的天：点条上哪儿都是展开这天，点到色块、底色也不选中——细条上的块太小点不准，看不见名字时选中也没用；
                      // 抢在色块自己的点击之前接住。展开的那天：点色块是选中，点空白处收起
                      onClickCapture={(event) => {
                        if (on) return;
                        event.stopPropagation();
                        setOpen(index);
                      }}
                      onClick={(event) => {
                        if (event.target === event.currentTarget) setOpen(-1);
                      }}
                    >
                      {/* 折起的那一截：钟点压在里面，画斜纹让人看出来 */}
                      {folds.before > 0 && (
                        <span aria-hidden data-fold="before" className="phone-fold" style={{ left: 0, width: folds.before }} />
                      )}
                      {folds.after > 0 && (
                        <span aria-hidden data-fold="after" className="phone-fold" style={{ right: 0, width: folds.after }} />
                      )}
                      {withGhosts(layout.background, rows[index]!.background, drag.dragView).map(({ item, ghost }) => (
                        <Bar
                          key={`${item.blockId}-${item.from}`}
                          ghost={ghost}
                          plan={shownPlan}
                          item={item}
                          hours={hours}
                          height={height}
                          lanes={1}
                          background
                          drag={on ? drag : null}
                        />
                      ))}
                      {withGhosts(layout.main, rows[index]!.main, drag.dragView).map(({ item, ghost }) => (
                        <Bar
                          key={`${item.blockId}-${item.from}`}
                          ghost={ghost}
                          plan={shownPlan}
                          item={item}
                          hours={hours}
                          height={height}
                          lanes={laneCount}
                          drag={on ? drag : null}
                          handles={on && !drag.dragView && selection.selectedId === item.blockId}
                        />
                      ))}
                      {base.date === today && (
                        <span
                          aria-hidden
                          className="phone-now"
                          style={{
                            left: offsetCss(axisOffset(hours, (Date.parse(now()) - baseStartUtcMs(base.date, base.tz)) / 60_000)),
                          }}
                        />
                      )}
                    </div>
                    {/* 这一格每天都留，没角标就空着：不然有角标的那天条短一截，块在天与天之间对不齐 */}
                    <span className="phone-undated-slot">
                      {undated > 0 && (
                        <span className="phone-undated" title={`还有 ${undated} 件没排时间`}>
                          +{undated}
                        </span>
                      )}
                    </span>
                  </div>
                  {on && (
                    <OpenDay
                      doc={doc}
                      library={library}
                      plan={plan}
                      libraryView={libraryView}
                      base={base}
                      label={labels[index]!}
                      index={index}
                      layout={layout}
                      hours={hours}
                      width={trackWidth}
                      measure={measure}
                      filter={filter}
                      tagText={(blockId, minutes, background) => tagText(plan, blockId, minutes, blockText, moneyCells, background)}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      {/* 选中的那件：快捷条贴着屏幕下边，拇指够得着。挂到页面最外层——卡片有背景模糊，fixed 放在里面会以卡片为准；
          刚做完的提示也在底部，它在的时候让到它上面 */}
      {drag.pointerLabel && <DragLabel label={drag.pointerLabel} />}
      {selectedBlock !== undefined &&
        createPortal(
          <div
            className="fixed inset-x-0 z-10 flex justify-center px-4"
            style={{
              bottom: noticeShown
                ? "calc(max(1rem, env(safe-area-inset-bottom)) + 3rem)"
                : "max(1rem, env(safe-area-inset-bottom))",
            }}
          >
            <QuickBar
              doc={doc}
              library={library}
              libraryView={libraryView}
              plan={plan}
              block={selectedBlock}
              moneyCell={moneyCells.get(selectedBlock.id)}
            />
          </div>,
          document.body,
        )}
    </div>
  );
}

/** 手机上加一件事默认多长（分钟），和电脑上点空白处建的一样 */
const ADD_MINUTES = 60;
/** 这天还空着时从几点起 */
const EMPTY_DAY_START = 540;
/** 开始最晚几点：排上时间只收 00:00–23:45（同从栏里拖上时间线） */
const LATEST_START = 1425;

/**
 * 手机上加一件事排在几点：这天主轨上各件事结尾最晚的那个（照 LumaFusion 播放头停在末尾时连着往后加）；
 * 这天还空着从 09:00 起；最晚那件过了午夜就夹在 23:45。
 */
export function afterLastMinute(blocks: ReadonlyArray<{ start: number; duration: number }>): number {
  if (blocks.length === 0) return EMPTY_DAY_START;
  return Math.min(Math.max(...blocks.map((block) => block.start + block.duration)), LATEST_START);
}

/**
 * 第一次打开展开哪天：日期不早于今天的第一天，一天都没有就最后一天。
 * 一条规则管四种情况——还没出发是第一天，进行中是今天，今天那天被删了是今天之后最近的一天，已经结束是最后一天。
 */
export function firstOpenDay(bases: ReadonlyArray<{ date: string }>, today: string): number {
  const upcoming = bases.findIndex((base) => base.date >= today);
  return upcoming >= 0 ? upcoming : bases.length - 1;
}

/**
 * 拖动中这一行要画的段：松手后的样子，再加上被拖的那件原来的段（隐形、不接点击）。
 * 手指按着的就是原来那段：它要是从页面上拿掉了（挪到别的天、换了开始时刻），浏览器后面的触摸就找不到人拦，
 * 当成滚动页面，把这次拖拽取消掉。原来那段还在松手后的样子里（没挪）就不用另画
 */
function withGhosts(
  shown: readonly PlacedSegment[],
  original: readonly PlacedSegment[],
  dragView: DragView | null,
): Array<{ item: PlacedSegment; ghost: boolean }> {
  const items = shown.map((item) => ({ item, ghost: false }));
  if (dragView === null || dragView.copying) return items;
  const keys = new Set(shown.map((item) => `${item.blockId}-${item.from}`));
  for (const item of original) {
    if (item.blockId === dragView.blockId && !keys.has(`${item.blockId}-${item.from}`)) items.push({ item, ghost: true });
  }
  return items;
}

/** 一段横条。色块上一个字都不写：字在下面那几行 */
function Bar({
  plan,
  item,
  hours,
  height,
  lanes,
  background = false,
  drag,
  handles = false,
  ghost = false,
}: {
  plan: PlanView;
  item: PlacedSegment;
  hours: HourWindow;
  height: number;
  lanes: number;
  background?: boolean;
  /** 展开那天才给：接长按拖；没展开的天是 null，点哪儿都是展开 */
  drag: { dragView: DragView | null; handlers: SegmentHandlers; handleHandlers: HandleHandlers } | null;
  /** 选中着：两端画把手，按住直接拖改长短（照 iMovie 的黄色把手） */
  handles?: boolean;
  /** 拖动中被拖的那件原来的段：隐形留在原处，见 withGhosts */
  ghost?: boolean;
}) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  // 道从 1 数
  const laneHeight = background ? height : Math.max((height - 2) / lanes, 4);
  return (
    <div
      data-segment
      data-block-id={item.blockId}
      data-mark={block.mark}
      data-track={item.track}
      data-continues-before={item.continuesBefore}
      data-continues-after={item.continuesAfter}
      data-lifted={!ghost && drag?.dragView?.liftedId === item.blockId ? true : undefined}
      data-ghost={ghost ? true : undefined}
      data-follower={drag?.dragView?.followers.includes(item.blockId) ? true : undefined}
      className="absolute"
      onPointerDown={drag ? (event) => drag.handlers.onPointerDown(event, item) : undefined}
      onPointerMove={drag ? (event) => drag.handlers.onPointerMove(event, item) : undefined}
      onClickCapture={drag?.handlers.onClickCapture}
      style={{
        zIndex: drag?.dragView?.liftedId === item.blockId ? 10 : undefined,
        left: offsetCss(axisOffset(hours, item.from)),
        width: offsetCss(spanOffset(hours, item.from, item.to)),
        top: background ? 0 : 1 + (item.lane - 1) * laneHeight,
        height: background ? height : laneHeight - 1,
        ...kindColor(plan, item.blockId),
      }}
    >
      <BlockButton
        blockId={item.blockId}
        name={`${block.title} ${zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}`}
        tags={block.tags}
        tagMarks={false}
        mark={block.mark}
        className={background ? "phone-bar phone-bar-back" : "phone-bar"}
      >
        {/* 色块上一个字都不写：名字在条下面那几行 */}
      </BlockButton>
      {handles && drag && !item.continuesBefore && (
        <span
          aria-hidden
          data-handle="start"
          className="phone-handle"
          onPointerDown={(event) => drag.handleHandlers.onPointerDown(event, item, "start")}
          onClickCapture={drag.handleHandlers.onClickCapture}
        />
      )}
      {handles && drag && !item.continuesAfter && (
        <span
          aria-hidden
          data-handle="end"
          className="phone-handle"
          onPointerDown={(event) => drag.handleHandlers.onPointerDown(event, item, "end")}
          onClickCapture={drag.handleHandlers.onClickCapture}
        />
      )}
    </div>
  );
}

/**
 * 展开的那一天：条下面的字、一行概况和「这天的操作」、这天没排时间的那几件、加一件事。
 * 竖排时这几样都在，横过来不能少——两个视图能做的操作一样（你提的，原话「时间轴和列表是等同的……那么操作数据也要一样」）
 */
function OpenDay({
  doc,
  library,
  plan,
  libraryView,
  base,
  label,
  index,
  layout,
  hours,
  width,
  measure,
  filter,
  tagText,
}: {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  base: PlanView["bases"][number];
  label: string;
  index: number;
  layout: RowLayout;
  hours: HourWindow;
  width: number;
  measure: (text: string) => number;
  filter: StatsFilter | undefined;
  tagText: TagText;
}) {
  const dayMenu = useDayMenu({ doc, library, libraryView, plan, base, label, index, count: plan.bases.length, filter });
  const selection = useBlockSelection();
  // 加一件事落在这天主轨最后一件的结尾（照剪辑 App 加在播放头处；你同意的），停留、住宿这些底层的不算，前一天接过来的那截也不算
  const lastEnds = layout.main
    .filter((item) => !item.continuesBefore)
    .map((item) => plan.blocks.get(item.blockId)!)
    .map((block) => ({ start: block.start_minute!, duration: block.duration_min ?? 0 }));
  const undated = undatedBlocks(plan, base, filter);
  return (
    <div className="phone-open">
      {width > 0 && <DayLabels plan={plan} layout={layout} hours={hours} width={width} measure={measure} tagText={tagText} />}
      {/* 这天没排时间的那几件：点一下选中，快捷条上排时间 */}
      {undated.length > 0 && (
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-[11px] leading-4 text-ink-muted">
            没排时间
          </span>
          <UndatedTray
            plan={plan}
            base={base}
            blocks={undated}
            trayRef={noop}
            dropLabel={null}
            draggingId={null}
            onChipPointerDown={noop}
            onChipClickCapture={noop}
          />
        </div>
      )}
      {/* 最后一行：加一件事，右边是这天的操作（原来单独一行概况「在杭州 · 排了 N 小时 · 还有 K 件没排时间」，和角标、条下面的名字重复，去掉了） */}
      <div data-add-row className="phone-add-row">
        <TimelineAddBlock
          doc={doc}
          library={library}
          plan={plan}
          baseId={base.id}
          filter={filter}
          className="input-bare select-text"
          at={{ minute: afterLastMinute(lastEnds), duration: ADD_MINUTES }}
          // 建完选中它：两端出把手、底部出快捷条，拖一下或点「时间」就能调（照 iMovie 点片段出黄色把手）
          onAdded={(blockId) => selection.select(blockId, base.id)}
        />
        {dayMenu.menu}
      </div>
      {dayMenu.form !== null && <div className="select-text">{dayMenu.form}</div>}
    </div>
  );
}

const noop = () => {};

/** 条下面一件事写什么：full 写得下写全，short 是右边放不下时退回的那版；「条上写」全关了是 null，这件事不写字也不画点 */
type TagText = (blockId: string, minutes: number, background: boolean) => { full: string; short: string } | null;

/** 按「条上写」拼：标题、时长、开销依次，退回时只留第一样；没填开销的不写「填开销」（那是电脑上点了能填的按钮） */
export function tagText(
  plan: PlanView,
  blockId: string,
  minutes: number,
  shown: BlockText,
  moneyCells: Map<string, MoneyCell>,
  background = false,
): { full: string; short: string } | null {
  const title = plan.blocks.get(blockId)!.title;
  // 底层类型（停留）铺满整条，时长、开销没意思：只写名字（这天在哪），关了「标题」就不写
  if (background) return shown.title && title !== "" ? { full: title, short: title } : null;
  const cell = moneyCells.get(blockId);
  const parts = [
    shown.title ? title : null,
    shown.duration ? durationLabel(minutes) : null,
    shown.money && !moneyCellEmpty(cell) ? moneyCellLabel(cell) : null,
  ].filter((part): part is string => part !== null && part !== "");
  if (parts.length === 0) return null;
  return { full: parts.join(" "), short: parts[0]! };
}

/** 条下面要写的几件：底层类型（停留）在前（跨天的也融进来，你提的：「跨天内容融合进去即可」），再是主轨上的事 */
export function tagItems(
  plan: PlanView,
  layout: Pick<RowLayout, "background" | "main">,
  tagText: TagText,
): { blockId: string; from: number; full: string; short: string }[] {
  return [
    ...layout.background.map((item) => ({ item, background: true })),
    ...layout.main.map((item) => ({ item, background: false })),
  ].flatMap(({ item, background }) => {
    const text = tagText(item.blockId, item.to - item.from, background);
    return text === null ? [] : [{ blockId: item.blockId, from: item.from, ...text }];
  });
}

/** 展开那天条下面的几行字：点钉在块的左边沿，一条同色的淡线直上直下连过去 */
function DayLabels({
  plan,
  layout,
  hours,
  width,
  measure,
  tagText,
}: {
  plan: PlanView;
  layout: RowLayout;
  hours: HourWindow;
  width: number;
  measure: (text: string) => number;
  tagText: TagText;
}) {
  const items: LabelInput[] = tagItems(plan, layout, tagText).map(({ blockId, from, full, short }) => ({
    key: `${blockId}-${from}`,
    x: (axisOffset(hours, from).pct / 100) * width + axisOffset(hours, from).px,
    full,
    short,
  }));
  const placed = packLabels(items, measure, width + SLOT);
  const rowCount = placed.length === 0 ? 0 : Math.max(...placed.map((label) => label.row)) + 1;
  if (rowCount === 0) return null;

  return (
    <div className="phone-tags" style={{ height: rowCount * ROW_H + 4 }}>
      {/* 线全部先画、字全部后画：不然后一条的引线会盖在前一条的字上 */}
      {placed.map((label) => (
        <span
          key={`lead-${label.key}`}
          aria-hidden
          className="phone-lead"
          style={{
            left: label.x + 2.5,
            height: label.row * ROW_H + 5,
            ...kindColor(plan, label.key.slice(0, label.key.lastIndexOf('-'))),
          }}
        />
      ))}
      {placed.map((label) => {
        const blockId = label.key.slice(0, label.key.lastIndexOf('-'));
        return (
          <span
            key={label.key}
            // 完成的那件名字上划一道：色块上没字划不了，划在这里（你提的：完成还要再加划掉的效果）
            data-mark={plan.blocks.get(blockId)!.mark}
            data-block-id={blockId}
            data-flipped={label.flip ? true : undefined}
            className={`phone-tag${label.flip ? " is-flipped" : ""}`}
            style={{ left: label.at, top: label.row * ROW_H, ...kindColor(plan, blockId) }}
          >
            {label.text}
          </span>
        );
      })}
    </div>
  );
}

