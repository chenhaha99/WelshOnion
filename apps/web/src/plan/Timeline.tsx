import type { BlockView, LibraryView, PlanView, StatsFilter, TransportMode } from "@welshonion/core";
import { useMemo, type CSSProperties } from "react";
import { Popover } from "../app/Popover";
import { distanceKmText } from "./block-details";
import { blockTimeLabel, durationLabel } from "./block-time";
import { dayRowLabels } from "./day-labels";
import { moneyCellLabel, type MoneyCell } from "./money-cells";
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

const TRANSPORT_NAMES: Readonly<Record<TransportMode, string>> = { drive: "自驾", transit: "公共交通", walk: "步行" };

interface TimelineProps {
  plan: PlanView;
  libraryView: LibraryView;
  /** 全计划的钱格摘要（已按筛选算过），详情里的钱用它 */
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
}

/**
 * 时间轴：一天一行，横向 0–24 点按真实比例，排上时间的块画成横条。
 * 类型层低的块画在行上方的细条里并在主轨后面铺淡色，其余的在主轨里分道，点横条看详情。
 */
export function Timeline({ plan, libraryView, moneyCells, filter }: TimelineProps) {
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

  return (
    <section aria-label="时间轴" className="glass-card flex flex-col gap-2 px-5 py-3">
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
                plan={plan}
                label={labels[index]!}
                layout={rows[index]!}
                moneyCells={moneyCells}
              />
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

interface TimelineRowProps {
  plan: PlanView;
  label: string;
  layout: RowLayout;
  moneyCells: ReadonlyMap<string, MoneyCell>;
}

function TimelineRow({ plan, label, layout, moneyCells }: TimelineRowProps) {
  const stripsHeight = layout.backgroundCount * STRIP_HEIGHT;
  const [dayNumber, ...rest] = label.split(" · ");

  return (
    <li aria-label={label} className="grid grid-cols-[5.5rem_1fr] gap-x-3 border-t border-ink/5 py-1.5">
      <div aria-hidden className="flex flex-col text-xs leading-4 text-ink-muted tabular-nums">
        <span className="text-ink">{dayNumber}</span>
        {rest.map((part) => (
          <span key={part}>{part}</span>
        ))}
      </div>
      <div data-timeline-axis className="relative" style={{ minHeight: stripsHeight + layout.laneCount * LANE_HEIGHT }}>
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
          />
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
}

/** 一段横条：外框放位置和 data 属性，里面的按钮点开详情。 */
function Segment({ plan, item, top, height, moneyCell }: SegmentProps) {
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
      className="absolute"
      // 缩得越深的画得越靠上：谁压谁不看在页面里的先后
      style={{ ...horizontal(item), top, height, zIndex: 1 + item.depth, ...kindColor(plan, item) }}
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
        {(close) => <BlockBubble block={block} date={date} time={time} moneyCell={moneyCell} close={close} />}
      </Popover>
    </div>
  );
}

interface BlockBubbleProps {
  block: BlockView;
  date: string;
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
