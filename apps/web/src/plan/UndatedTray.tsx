import { passesFilter, type BaseView, type BlockView, type PlanView, type StatsFilter } from "@welshonion/core";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { BlockPopover } from "./BlockBubble";
import { blockTimeLabel } from "./block-time";
import type { MoneyCell } from "./money-cells";
import { kindColor } from "./timeline-draw";

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
  moneyCells: ReadonlyMap<string, MoneyCell>;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 正拖进这一栏时，松手会进哪一格（「上午」）；没往这里拖是 null */
  dropLabel: string | null;
  /** 正在被拖的那一件 */
  draggingId: string | null;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

/**
 * 时间轴的「没排时间」：一天里没排时间的一串事，每件写标题和时间格的字，点一下打开详情。
 * 横排在每行右边，按住能拖；这一栏一直在，没有事时是空的，横条也能拖进来。竖排在框下面，不能拖。
 */
export function UndatedTray({
  plan,
  base,
  blocks,
  moneyCells,
  trayRef,
  dropLabel,
  draggingId,
  onChipPointerDown,
  onChipClickCapture,
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
        return (
          <div
            key={block.id}
            data-undated-chip
            data-block-id={block.id}
            data-slot={block.slot ?? "day"}
            data-pending={block.status.id === "pending"}
            data-dragging={draggingId === block.id ? true : undefined}
            style={kindColor(plan, block.id)}
            onPointerDown={(event) => onChipPointerDown(event, block.id)}
            onClickCapture={onChipClickCapture}
          >
            <BlockPopover
              block={block}
              time={time}
              trigger={
                <>
                  <span className="truncate">{block.title}</span>
                  <span className="ml-auto shrink-0 pl-1 text-[10px] text-ink-muted">{time}</span>
                </>
              }
              triggerClassName="timeline-chip"
              align="end"
              moneyCell={moneyCells.get(block.id)}
            />
          </div>
        );
      })}
      {dropLabel !== null && (
        <div data-drag-ghost className="timeline-tray-ghost">
          {dropLabel}
        </div>
      )}
    </div>
  );
}
