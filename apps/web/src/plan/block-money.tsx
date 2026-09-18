import { countBlocksUsing, type BlockView, type LibraryView, type PlanView } from "@welshonion/core";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { linkableExpenses } from "./expense-links";
import { MoneyEditor } from "./MoneyEditor";
import { moneyCellEmpty, moneyCellLabel, type MoneyCell } from "./money-cells";
import { useBlockSelection } from "./select-block";

interface BlockMoneyProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  block: BlockView;
  /** 这件事的开销格摘要（按筛选算过）；一笔开销都没挂是 undefined */
  moneyCell: MoneyCell | undefined;
  /** 快捷条上的「¥」，还是块上附件栏里写着的开销 */
  variant: "bar" | "line";
}

/**
 * 改这件事的开销，两处共用：快捷条上的「¥」、块上附件栏里写着的开销。
 * 点了贴着按钮弹出完整的开销编辑区（和日程里点开销格展开的是同一套）：每笔一行能改类型、金额、人均或总价、说明，
 * 末尾一行空的填了才建，下面还能挂上已有的一笔。你提的：以前只弹一个填金额的小框，「现在太简单」。
 */
export function BlockMoney({ doc, library, libraryView, plan, block, moneyCell, variant }: BlockMoneyProps) {
  const selection = useBlockSelection();
  const text = moneyCellLabel(moneyCell);
  const label = `开销：${text}`;
  const line = variant === "line";
  // 类名写成完整的一段：Tailwind 扫源码找类名，`timeline-money${...}` 这样插值粘在后面它认不出来
  const emptyClass = moneyCellEmpty(moneyCell) ? " timeline-money-empty" : "";
  const triggerClassName = line ? "timeline-money" + emptyClass : "quick-button tabular-nums";
  const trigger = line ? <span className="truncate">{text}</span> : <span aria-hidden>¥</span>;
  const kinds = [...libraryView.kinds.values()].sort((a, b) => a.order - b.order);

  const button = (
    <Popover
      label={label}
      triggerTitle={label}
      trigger={trigger}
      triggerClassName={triggerClassName}
      role="dialog"
      panelLabel="改开销"
      panelClassName="menu w-[22rem] max-w-full p-2"
      align="end"
      estimatedHeight={200}
    >
      {(close) => (
        <MoneyEditor
          doc={doc}
          library={library}
          plan={plan}
          kinds={kinds}
          countKindUsing={(kindId) => countBlocksUsing(plan, { kindId })}
          block={block}
          label={`${block.title} 的开销`}
          // 块的类型被删了时，新一笔先记成「其他」
          defaultKindId={block.kind.deleted ? "other" : block.kind.id}
          linkChoices={linkableExpenses(plan, block.id)}
          onDone={() => close(true)}
        />
      )}
    </Popover>
  );

  // 块上附件栏里的开销：点它同时选中这件事（拖它还是拖整块，按下照样传给外面的横条）
  return line ? (
    <span data-bar-money className="timeline-money-slot" onPointerDown={() => selection.select(block.id, null)}>
      {button}
    </span>
  ) : (
    button
  );
}
