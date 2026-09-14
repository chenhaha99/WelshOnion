import type { BlockView, TransportMode } from "@welshonion/core";
import type { ReactNode } from "react";
import { Popover } from "../app/Popover";
import { distanceKmText } from "./block-details";
import { durationLabel } from "./block-time";
import { moneyCellLabel, type MoneyCell } from "./money-cells";

const TRANSPORT_NAMES: Readonly<Record<TransportMode, string>> = { drive: "自驾", transit: "公共交通", walk: "步行" };

interface BlockPopoverProps {
  block: BlockView;
  /** 时间格的字：「09:00–12:00」「上午 · 2 小时」 */
  time: string;
  trigger: ReactNode;
  triggerClassName: string;
  align: "start" | "end";
  moneyCell: MoneyCell | undefined;
}

/** 时间轴上的一件事：按钮的读屏名是「标题 时间」，点开是只读的详情。横条、竖条、「没排时间」栏里的一件共用。 */
export function BlockPopover({ block, time, trigger, triggerClassName, align, moneyCell }: BlockPopoverProps) {
  const name = `${block.title} ${time}`;
  return (
    <Popover
      label={name}
      triggerTitle={name}
      trigger={trigger}
      triggerClassName={triggerClassName}
      role="dialog"
      panelLabel={block.title}
      panelClassName="menu w-72 p-3"
      align={align}
      estimatedHeight={220}
    >
      {(close) => <BlockBubble block={block} time={time} moneyCell={moneyCell} close={close} />}
    </Popover>
  );
}

interface BlockBubbleProps {
  block: BlockView;
  time: string;
  moneyCell: MoneyCell | undefined;
  close: (returnFocus?: boolean) => void;
}

/** 详情：只读，要改就「在表里改」跳到安排表那一行。 */
function BlockBubble({ block, time, moneyCell, close }: BlockBubbleProps) {
  const duration = block.duration_min ?? 0;
  // 没排时间的块，时间格的字里已经带着时长
  const timeLine = block.start_minute === null || duration === 0 ? time : `${time} · ${durationLabel(duration)}`;
  const route = routeText(block);
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <h3 className="font-medium text-ink">{block.title}</h3>
      <p className="text-ink-muted">
        {block.kind.deleted ? "已删除的类型" : block.kind.name} · {block.status.deleted ? "已删除的状态" : block.status.name}
      </p>
      <p className="text-ink tabular-nums">{timeLine}</p>
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
