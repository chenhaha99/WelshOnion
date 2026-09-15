import { passesFilter, type BaseView, type BlockView, type PlanView, type StatsFilter } from "@welshonion/core";
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { blockTimeLabel } from "./block-time";
import { BlockButton } from "./open-block";
import { kindColor } from "./timeline-draw";

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
  /** 跟在这一串后面、也在栏里的东西：横排放这一天的「加一件事」，行不用多占一截，拖进栏的地方也大一些 */
  children?: ReactNode;
}

/**
 * 时间轴的「没排时间」：一天里没排时间的一串事，每件写标题和时间格的字，缩进了的往右缩，点一下打开详情面板。
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
          <div
            key={block.id}
            data-undated-chip
            data-block-id={block.id}
            data-slot={block.slot ?? "day"}
            data-pending={block.status.id === "pending"}
            data-dragging={draggingId === block.id ? true : undefined}
            style={{ ...kindColor(plan, block.id), ...(indent > 0 ? { marginLeft: indent * INDENT_PX } : {}) }}
            onPointerDown={(event) => onChipPointerDown(event, block.id)}
            onClickCapture={onChipClickCapture}
          >
            <BlockButton blockId={block.id} name={`${block.title} ${time}`} className="timeline-chip">
              <span className="truncate">{block.title}</span>
              <span className="ml-auto shrink-0 pl-1 text-[10px] text-ink-muted">{time}</span>
            </BlockButton>
          </div>
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
