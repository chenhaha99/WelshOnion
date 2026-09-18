import type { BlockView, PlanView } from "@welshonion/core";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { blockTimeLabel } from "./block-time";
import { ClockIcon } from "./icons";
import { TimeEditor } from "./TimeEditor";
import { zoneTimeLabel } from "./zone-time";

interface BlockTimeButtonProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
}

/**
 * 快捷条上的「时间」：点了贴着按钮弹出时间的编辑区（和日程里点时间格展开的是同一套）。
 * 排上时间、改时长、换天、取消时间都在这里；已经排上时间的，直接在时间线上拖更快。
 * 手机上没法把条上的事拖到竖轴上，这个按钮是它唯一的排时间入口。
 */
export function BlockTimeButton({ doc, library, plan, block }: BlockTimeButtonProps) {
  const date = plan.bases.find((base) => base.id === block.start_base_id)?.date ?? "";
  const label = `时间：${zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}`;

  return (
    <Popover
      label={label}
      triggerTitle={label}
      trigger={<ClockIcon />}
      triggerClassName="quick-button"
      role="dialog"
      panelLabel="改时间"
      panelClassName="menu w-[22rem] max-w-full p-2"
      align="end"
      estimatedHeight={140}
    >
      {(close) => <TimeEditor doc={doc} library={library} plan={plan} block={block} onDone={() => close(true)} />}
    </Popover>
  );
}
