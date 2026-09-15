import { baseStartUtcMs, type BlockView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type * as Y from "yjs";
import { useNow, useTimeZone } from "../app/services";
import { BlockPopover } from "./BlockBubble";
import { blockTimeLabel } from "./block-time";
import { DragLabel } from "./DragLabel";
import { todayIn } from "./day-labels";
import type { MoneyCell } from "./money-cells";
import { initialDayIndex, scrollMinute } from "./timeline-day";
import { HOUR_LINES, HOUR_TICKS, kindColor, percent } from "./timeline-draw";
import type { PlacedSegment, RowLayout } from "./timeline-layout";
import { UndatedTray, undatedBlocks } from "./UndatedTray";
import { useTimelineDrag, type DragView, type SegmentHandlers } from "./use-timeline-drag";
import { zoneTimeLabel } from "./zone-time";

/** 竖排每小时多高、背景细条每条多宽（像素）；块和块之间留多少；叠在上面的块每级从左边缩多少 */
const HOUR_HEIGHT = 48;
const STRIP_WIDTH = 12;
const GAP = 2;
const DEPTH_INSET = 4;

const noop = () => {};

interface DayTimelineProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  libraryView: LibraryView;
  /** 每一行摆好的横条（已经按筛选算过），和横排共用 */
  rows: readonly RowLayout[];
  /** 每一行的标签：「第 1 天 · 10.1 周四」 */
  labels: readonly string[];
  moneyCells: ReadonlyMap<string, MoneyCell>;
  filter: StatsFilter | undefined;
  /** 详情里「这天从这件起往后推迟」的做法 */
  shiftLater: (block: BlockView, deltaMin: number) => void;
}

/**
 * 窄屏上的时间轴：一次看一天，纵向 0–24 点按真实比例，放在能上下滚的框里。
 * 打开时落在今天（没出发是第一天，已结束是最后一天），滚到现在或这天第一件事；只在打开、翻天时滚。
 * 块画成竖条，同一层重叠的并排成列，停留、住宿这类在左边的细条里；竖条能拖着挪时间（见 use-timeline-drag）。
 * 框下面列出这天没排时间的事（没有就不出现），那里的事不能拖。
 */
export function DayTimeline({ doc, library, plan, libraryView, rows, labels, moneyCells, filter, shiftLater }: DayTimelineProps) {
  const now = useNow();
  const timeZone = useTimeZone();
  const today = todayIn(now(), timeZone);
  const todayIndex = initialDayIndex(plan.bases, today);
  const [chosen, setChosen] = useState(todayIndex);
  // 计划里删了天、行数变少时，夹回最后一行
  const index = Math.min(chosen, plan.bases.length - 1);
  const base = plan.bases[index]!;
  const layout = rows[index]!;
  const inTrip = today >= plan.bases[0]!.date && today <= plan.bases[plan.bases.length - 1]!.date;

  const scroller = useRef<HTMLDivElement>(null);
  const drag = useTimelineDrag({ doc, library, plan, libraryView, rows, filter, day: index, scroller });
  // 只在打开、翻天时滚：改块、加块时这一行的 id 不变，不滚
  useLayoutEffect(() => {
    // 现在的钟点按这一天底座自己的时区算，出境后改过时区的那天也对
    const nowMinute = (Date.parse(now()) - baseStartUtcMs(base.date, base.tz)) / 60_000;
    scroller.current!.scrollTop = (scrollMinute(layout, base.date === today, nowMinute) / 60) * HOUR_HEIGHT;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base.id]);

  const stripsWidth = layout.backgroundCount * STRIP_WIDTH;
  const undated = undatedBlocks(plan, base, filter);
  const preview = drag.preview;
  // 预览框：主轨的块盖住主轨整宽，背景细条的块盖住细条那一栏；上下是松手后落在这一天里的那段
  const ghostPlace: CSSProperties =
    preview?.track === "background"
      ? { left: 0, width: Math.max(stripsWidth, STRIP_WIDTH) - GAP }
      : { left: stripsWidth === 0 ? 0 : stripsWidth + GAP, right: 0 };

  return (
    <div ref={drag.containerRef} data-timeline-dragging={drag.dragView ? true : undefined} className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button type="button" className="btn btn-ghost px-2.5" disabled={index === 0} onClick={() => setChosen(index - 1)}>
          前一天
        </button>
        <h3 data-timeline-day className="min-w-0 flex-1 truncate text-center text-sm text-ink tabular-nums">
          {labels[index]}
        </h3>
        <button
          type="button"
          className="btn btn-ghost px-2.5"
          disabled={index === plan.bases.length - 1}
          onClick={() => setChosen(index + 1)}
        >
          后一天
        </button>
      </div>
      {inTrip && base.date !== today && (
        <button type="button" className="btn btn-ghost self-center" onClick={() => setChosen(todayIndex)}>
          回到今天
        </button>
      )}
      {/* 上下各留 8 像素：钟点的字以线为中心画，滚到整点时最上面那个字不被框切掉一半 */}
      <div ref={scroller} data-day-scroll className="h-[28rem] overflow-y-auto rounded-lg border border-ink/5 py-2">
        <div className="grid grid-cols-[2.5rem_1fr]" style={{ height: 24 * HOUR_HEIGHT }}>
          <div aria-hidden className="relative">
            {HOUR_TICKS.map((hour) => (
              <span
                key={hour}
                data-hour-tick
                className="absolute right-1.5 -translate-y-1/2 text-[11px] leading-4 text-ink-muted tabular-nums"
                style={{ top: percent(hour * 60) }}
              >
                {hour}
              </span>
            ))}
          </div>
          <div ref={drag.axisRef(index)} data-day-axis className="relative">
            {HOUR_LINES.map((hour) => (
              <div
                key={hour}
                aria-hidden
                className={`absolute inset-x-0 h-px ${hour % 6 === 0 ? "bg-ink/12" : "bg-ink/5"}`}
                style={{ top: percent(hour * 60) }}
              />
            ))}
            {layout.background.map((item) => (
              <div
                key={`wash-${item.blockId}`}
                aria-hidden
                className="timeline-wash absolute right-0"
                style={{ ...vertical(item), left: stripsWidth, ...kindColor(plan, item.blockId) }}
              />
            ))}
            {layout.background.map((item) => (
              <DaySegment
                key={`background-${item.blockId}`}
                plan={plan}
                item={item}
                place={{ left: (item.lane - 1) * STRIP_WIDTH, width: STRIP_WIDTH - GAP }}
                moneyCell={moneyCells.get(item.blockId)}
                dragView={drag.dragView}
                handlers={drag.handlers}
                shiftLater={shiftLater}
              />
            ))}
            {layout.main.map((item) => (
              <DaySegment
                key={`main-${item.blockId}`}
                plan={plan}
                item={item}
                place={column(item, layout.laneCount, stripsWidth)}
                moneyCell={moneyCells.get(item.blockId)}
                dragView={drag.dragView}
                handlers={drag.handlers}
                shiftLater={shiftLater}
              />
            ))}
            {preview?.pieces
              .filter((piece) => piece.row === index)
              .map((piece) => (
                <div
                  key="ghost"
                  data-drag-ghost
                  data-from={piece.from}
                  data-to={piece.to}
                  className="timeline-ghost"
                  style={{ ...ghostPlace, top: percent(piece.from), height: percent(piece.to - piece.from), minHeight: 2 }}
                />
              ))}
          </div>
        </div>
      </div>
      {/* 竖排没有表头，自己写上「没排时间」；这天没有就整块不出现：竖排不能拖进来，空着只占地方 */}
      {undated.length > 0 && (
        <div className="flex flex-col gap-1">
          <span aria-hidden className="text-[11px] leading-4 text-ink-muted">
            没排时间
          </span>
          <UndatedTray
            plan={plan}
            base={base}
            blocks={undated}
            moneyCells={moneyCells}
            trayRef={noop}
            dropLabel={null}
            draggingId={null}
            onChipPointerDown={noop}
            onChipClickCapture={noop}
          />
        </div>
      )}
      {drag.pointerLabel && <DragLabel label={drag.pointerLabel} />}
    </div>
  );
}

interface DaySegmentProps {
  plan: PlanView;
  item: PlacedSegment;
  /** 横向的位置：第几列、多宽 */
  place: CSSProperties;
  moneyCell: MoneyCell | undefined;
  dragView: DragView | null;
  handlers: SegmentHandlers;
  shiftLater: (block: BlockView, deltaMin: number) => void;
}

/** 一段竖条：外框放位置、data 属性和拖拽的监听（和横排一样），里面的按钮点开详情。背景细条太窄，不写字。 */
function DaySegment({ plan, item, place, moneyCell, dragView, handlers, shiftLater }: DaySegmentProps) {
  const block = plan.blocks.get(item.blockId)!;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const point = item.from === item.to;
  const buttonClass = point ? "timeline-marker-h" : item.track === "background" ? "timeline-strip" : "timeline-bar";

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
      style={{ ...vertical(item), ...place, zIndex: 1 + item.depth, ...kindColor(plan, item.blockId) }}
      onPointerDown={(event) => handlers.onPointerDown(event, item)}
      onClickCapture={handlers.onClickCapture}
    >
      <BlockPopover
        block={block}
        time={zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}
        // 名字单独一段：竖排里竖条开头滚出框的上边时，名字贴着框的上边（见 index.css）
        trigger={point || item.track === "background" ? null : <span data-bar-title>{block.title}</span>}
        triggerClassName={buttonClass}
        align="start"
        moneyCell={moneyCell}
        onShiftLater={(deltaMin) => shiftLater(block, deltaMin)}
      />
    </div>
  );
}

function vertical(item: PlacedSegment): CSSProperties {
  return { top: percent(item.from), height: percent(item.to - item.from) };
}

/** 主轨在背景细条右边，按道数平分成列；叠在上面的块从左边缩。 */
function column(item: PlacedSegment, laneCount: number, stripsWidth: number): CSSProperties {
  const offset = stripsWidth === 0 ? 0 : stripsWidth + GAP;
  const inset = item.depth * DEPTH_INSET;
  return {
    left: `calc(${offset}px + (100% - ${offset}px) * ${(item.lane - 1) / laneCount} + ${inset}px)`,
    width: `calc((100% - ${offset}px) / ${laneCount} - ${inset + GAP}px)`,
  };
}
