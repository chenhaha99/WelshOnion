import { passesFilter, type BaseView, type BlockView, type PlanView, type StatsFilter } from "@welshonion/core";
import { Fragment, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { blockTimeLabel, monthDay } from "./block-time";
import { BlockButton } from "./select-block";
import { kindColor } from "./timeline-draw";
import { QUICK_BAR_ROW_PX } from "./timeline-geometry";

/** 缩进一级往右缩多少像素 */
const INDENT_PX = 12;

/** 一天里没排时间、通过筛选的事，顺序同安排表（整天、上午、下午、晚上，同一格按这天的排序）。 */
export function undatedBlocks(plan: PlanView, base: BaseView, filter: StatsFilter | undefined): BlockView[] {
  const groups = plan.undated.get(base.id)!;
  return [...groups.day, ...groups.morning, ...groups.afternoon, ...groups.evening]
    .map((id) => plan.blocks.get(id)!)
    .filter((block) => passesFilter(block, filter));
}

interface UndatedTrayProps {
  plan: PlanView;
  base: BaseView;
  /** 要列的事，由 undatedBlocks 算好 */
  blocks: readonly BlockView[];
  trayRef: (element: HTMLDivElement | null) => void;
  /** 正拖进这一栏时，松手会进哪一格（「上午」）；没往这里拖是 null */
  dropLabel: string | null;
  /** 正在被拖的那一件 */
  draggingId: string | null;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  /** 选中的那件事的快捷条：画在它自己那一件下面 */
  quickBar?: { blockId: string; node: ReactNode };
  /** 跟在这一串后面、也在栏里的东西：横排放这一天的「加一件事」，行不用多占一截，拖进栏的地方也大一些 */
  children?: ReactNode;
}

/**
 * 时间轴的「没排时间」：一天里没排时间的一串事，每件写标题和时间格的字，缩进了的往右缩，点一下选中它（下面出快捷条）。
 * 横排在每行右边，按住能拖；这一栏一直在，没有事时是空的，横条也能拖进来。竖排在框下面，不能拖。
 */
export function UndatedTray({
  plan,
  base,
  blocks,
  trayRef,
  dropLabel,
  draggingId,
  onChipPointerDown,
  onChipClickCapture,
  quickBar,
  children,
}: UndatedTrayProps) {
  return (
    <div
      ref={trayRef}
      role="group"
      aria-label="没排时间"
      data-timeline-tray
      data-drop-target={dropLabel !== null ? true : undefined}
      className="flex min-h-7 flex-col gap-0.5 py-0.5"
    >
      {blocks.map((block) => {
        const time = blockTimeLabel(block, base.date);
        const indent = block.indent ?? 0;
        return (
          <Fragment key={block.id}>
            <div
              data-undated-chip
              data-block-id={block.id}
              data-slot={block.slot ?? "day"}
              data-checked={block.checked}
              data-dragging={draggingId === block.id ? true : undefined}
              style={{ ...kindColor(plan, block.id), ...(indent > 0 ? { marginLeft: indent * INDENT_PX } : {}) }}
              onPointerDown={(event) => onChipPointerDown(event, block.id)}
              onClickCapture={onChipClickCapture}
            >
              <BlockButton
                blockId={block.id}
                name={`${block.title} ${time}`}
                tags={block.tags}
                checked={block.checked}
                className="timeline-chip"
              >
                <span className="truncate">{block.title}</span>
                <span className="ml-auto shrink-0 pl-1 text-[10px] text-ink-muted">{time}</span>
              </BlockButton>
            </div>
            {quickBar?.blockId === block.id && (
              // 这一栏只有 9rem 宽，快捷条比它宽：浮在这一件下面、右边对齐，往左盖住一点横轴
              <div className="relative" style={{ height: QUICK_BAR_ROW_PX }}>
                <div className="absolute top-0.5 right-0 z-20">{quickBar.node}</div>
              </div>
            )}
          </Fragment>
        );
      })}
      {dropLabel !== null && (
        <div data-drag-ghost className="timeline-tray-ghost">
          {dropLabel}
        </div>
      )}
      {children}
    </div>
  );
}

/** 整个计划里没排时间、又通过筛选的事：按天、再按格子排好，每件带着它那天。 */
export function undatedAcrossDays(
  plan: PlanView,
  filter: StatsFilter | undefined,
): Array<{ block: BlockView; base: BaseView }> {
  return plan.bases.flatMap((base) => undatedBlocks(plan, base, filter).map((block) => ({ block, base })));
}

interface UndatedStripProps {
  plan: PlanView;
  filter: StatsFilter | undefined;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 正往这里拖时，松手会进哪一格（「上午」）；没往这里拖是 null */
  dropLabel: string | null;
  /** 正在被拖的那一件 */
  draggingId: string | null;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  /** 选中的那件没排时间的事的快捷条：画在条下面 */
  quickBar?: ReactNode;
  /** 正拖着一件排上时间的事：条上一件都没有时也要画出来，不然没地方可拖 */
  showWhenEmpty: boolean;
}

/**
 * 时间轴上面的「没排时间」条：整个计划里没排时间的事横着排一行，每件写日期和标题，
 * 放不下就在这一条里横向滚。一件都没有、又没在往这里拖时，整条不出现。
 */
export function UndatedStrip({
  plan,
  filter,
  trayRef,
  dropLabel,
  draggingId,
  onChipPointerDown,
  onChipClickCapture,
  quickBar,
  showWhenEmpty,
}: UndatedStripProps) {
  const items = undatedAcrossDays(plan, filter);
  if (items.length === 0 && dropLabel === null && !showWhenEmpty) return null;
  // 条上一件都没有、只是拖动中才画出来的：浮在时间轴上面，不占位——占位会把横轴顶下去，拖着的落点就偏了
  const floating = items.length === 0;
  return (
    <div className={floating ? "absolute inset-x-0 top-0 z-30" : "flex flex-col gap-1"}>
      <div
        ref={trayRef}
        role="group"
        aria-label="没排时间"
        data-timeline-tray="strip"
        data-drop-target={dropLabel !== null ? true : undefined}
        className={`flex items-center gap-1.5 overflow-x-auto py-0.5 ${
          floating ? "rounded-lg border border-dashed border-sage/60 bg-white/85 px-2 backdrop-blur-[2px]" : ""
        }`}
      >
        <span aria-hidden className="shrink-0 pr-0.5 text-[11px] leading-4 text-ink-muted">
          没排时间
        </span>
        {items.map(({ block, base }) => {
          const time = blockTimeLabel(block, base.date);
          const indent = block.indent ?? 0;
          return (
            <div
              key={block.id}
              data-undated-chip
              data-block-id={block.id}
              data-slot={block.slot ?? "day"}
              data-checked={block.checked}
              data-dragging={draggingId === block.id ? true : undefined}
              className="shrink-0"
              style={{ ...kindColor(plan, block.id), ...(indent > 0 ? { marginLeft: indent * INDENT_PX } : {}) }}
              onPointerDown={(event) => onChipPointerDown(event, block.id)}
              onClickCapture={onChipClickCapture}
            >
              <BlockButton
                blockId={block.id}
                name={`${block.title} ${monthDay(base.date)} ${time}`}
                tags={block.tags}
                checked={block.checked}
                className="timeline-chip"
              >
                <span aria-hidden className="shrink-0 pr-1 text-[10px] text-ink-muted tabular-nums">
                  {monthDay(base.date)}
                </span>
                <span className="truncate">{block.title}</span>
              </BlockButton>
            </div>
          );
        })}
        {dropLabel !== null && (
          <div data-drag-ghost className="timeline-tray-ghost shrink-0">
            {dropLabel}
          </div>
        )}
        {items.length === 0 && dropLabel === null && (
          <span className="shrink-0 text-[11px] leading-4 text-ink-muted">拖到这里就变回没排时间</span>
        )}
      </div>
      {quickBar !== undefined && <div className="flex">{quickBar}</div>}
    </div>
  );
}
