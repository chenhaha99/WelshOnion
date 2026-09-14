import { passesFilter, type BaseView, type PlanView, type StatsFilter } from "@welshonion/core";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { Popover } from "../app/Popover";
import { BlockBubble } from "./BlockBubble";
import { blockTimeLabel } from "./block-time";
import type { MoneyCell } from "./money-cells";

const DELETED_COLOR = "#9aa3ad";

interface UndatedTrayProps {
  plan: PlanView;
  base: BaseView;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 按状态筛选；没开是 undefined */
  filter: StatsFilter | undefined;
  trayRef: (element: HTMLDivElement | null) => void;
  /** 正拖进这一栏时，松手会进哪一格（「上午」）；没往这里拖是 null */
  dropLabel: string | null;
  /** 正在被拖的那一件 */
  draggingId: string | null;
  onChipPointerDown: (event: ReactPointerEvent<HTMLDivElement>, blockId: string) => void;
  onChipClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
}

/**
 * 时间轴一行右边的「没排时间」栏：这天没排时间、通过筛选的事，顺序同安排表（整天、上午、下午、晚上，同一格按这天的排序）。
 * 每件写标题和时间格的字，点一下打开详情，按住能拖。这一栏一直在，没有事时是空的，横条也能拖进来。
 */
export function UndatedTray({
  plan,
  base,
  moneyCells,
  filter,
  trayRef,
  dropLabel,
  draggingId,
  onChipPointerDown,
  onChipClickCapture,
}: UndatedTrayProps) {
  const groups = plan.undated.get(base.id)!;
  const blocks = [...groups.day, ...groups.morning, ...groups.afternoon, ...groups.evening]
    .map((id) => plan.blocks.get(id)!)
    .filter((block) => passesFilter(block, filter));

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
        const name = `${block.title} ${time}`;
        return (
          <div
            key={block.id}
            data-undated-chip
            data-block-id={block.id}
            data-slot={block.slot ?? "day"}
            data-pending={block.status.id === "pending"}
            data-dragging={draggingId === block.id ? true : undefined}
            style={{ "--kind-color": block.kind.deleted ? DELETED_COLOR : block.kind.color } as CSSProperties}
            onPointerDown={(event) => onChipPointerDown(event, block.id)}
            onClickCapture={onChipClickCapture}
          >
            <Popover
              label={name}
              triggerTitle={name}
              trigger={
                <>
                  <span className="truncate">{block.title}</span>
                  <span className="ml-auto shrink-0 pl-1 text-[10px] text-ink-muted">{time}</span>
                </>
              }
              triggerClassName="timeline-chip"
              role="dialog"
              panelLabel={block.title}
              panelClassName="menu w-72 p-3"
              align="end"
              estimatedHeight={200}
            >
              {(close) => <BlockBubble block={block} time={time} moneyCell={moneyCells.get(block.id)} close={close} />}
            </Popover>
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
