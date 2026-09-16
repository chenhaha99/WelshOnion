import { addExpense, updateExpense, type BlockView, type ExpenseView, type PlanView } from "@welshonion/core";
import { useRef, useState } from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { parseYuan } from "./money";
import { moneyCellEmpty, moneyCellLabel, type MoneyCell } from "./money-cells";
import { useOpenBlock } from "./open-block";
import { useBlockSelection } from "./select-block";

const AMOUNT_ERROR = "要填不小于 0 的数，最多两位小数";

interface BlockMoneyProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  /** 这件事的开销格摘要（按筛选算过）；一笔开销都没挂是 undefined */
  moneyCell: MoneyCell | undefined;
  /** 快捷条上的「¥」，还是块上写着开销的那一行 */
  variant: "bar" | "line";
  /** 块上只写开销、不写标题：这一行就是块的正文，占满块、字竖直居中 */
  solo?: boolean;
}

/**
 * 改这件事的开销，两处共用：快捷条上的「¥」、块上写着开销的那一行。
 * 一笔都没挂、或只挂着一笔自己的开销时，点了弹个只填金额的小框；
 * 挂着多笔、有共用的、按类型筛掉了一部分时，小框写不下，改为打开详情面板、展开开销的编辑区。
 */
export function BlockMoney({ doc, library, plan, block, moneyCell, variant, solo = false }: BlockMoneyProps) {
  const openBlock = useOpenBlock();
  const selection = useBlockSelection();
  const text = moneyCellLabel(moneyCell);
  const label = `开销：${text}`;
  const attached = [...plan.expenses.values()].filter((expense) => expense.block_ids.includes(block.id));
  const only = attached.length === 1 && attached[0]!.block_ids.length === 1 ? attached[0]! : null;
  const simple = !moneyCell?.otherKinds && (attached.length === 0 || only !== null);
  const line = variant === "line";
  // 类名写成完整的一段：Tailwind 扫源码找类名，`timeline-money${...}` 这样插值粘在后面它认不出来
  const emptyClass = moneyCellEmpty(moneyCell) ? " timeline-money-empty" : "";
  const triggerClassName = line ? "timeline-money" + emptyClass : "quick-button tabular-nums";
  const trigger = line ? <span className="truncate">{text}</span> : <span aria-hidden>¥</span>;

  const button = simple ? (
    <Popover
      label={label}
      triggerTitle={label}
      trigger={trigger}
      triggerClassName={triggerClassName}
      role="dialog"
      panelLabel="改开销"
      panelClassName="menu p-2"
      align="end"
      estimatedHeight={80}
    >
      {(close) => <AmountBox doc={doc} library={library} block={block} expense={only} close={close} />}
    </Popover>
  ) : (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={triggerClassName}
      onClick={(event) => openBlock(block.id, event.currentTarget, "money")}
    >
      {trigger}
    </button>
  );

  // 块上那一行：点它同时选中这件事（拖它还是拖整块，按下照样传给外面的横条）
  return line ? (
    <span
      data-bar-money
      className={solo ? "timeline-money-slot timeline-money-solo" : "timeline-money-slot"}
      onPointerDown={() => selection.select(block.id, null)}
    >
      {button}
    </span>
  ) : (
    button
  );
}

interface AmountBoxProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  /** 要改的那一笔；一笔都没挂是 null（填了才建） */
  expense: ExpenseView | null;
  close: (returnFocus?: boolean) => void;
}

/** 只填金额的小框：回车或点别处保存，Esc 放弃。填空就是这一笔没填金额（那一笔还在）。 */
function AmountBox({ doc, library, block, expense, close }: AmountBoxProps) {
  const [text, setText] = useState(
    expense === null || expense.amount_cents === null ? "" : String(expense.amount_cents / 100),
  );
  const [error, setError] = useState<string | null>(null);
  // 回车已经存过、或者按了 Esc 不存：接着弹层关掉时框会失去焦点，那一次不再存（不然会建出两笔）
  const settled = useRef(false);

  const save = (): boolean => {
    const parsed = parseYuan(text.trim());
    if (!parsed.ok) {
      setError(AMOUNT_ERROR);
      return false;
    }
    if (expense === null) {
      // 一笔都没挂：填了金额才建，类型跟着这件事（类型被删了就记「其他」）
      if (parsed.cents !== null) {
        addExpense(doc, library, {
          title: "",
          amountCents: parsed.cents,
          blockIds: [block.id],
          kindId: block.kind.deleted ? "other" : block.kind.id,
        });
      }
    } else if (parsed.cents !== expense.amount_cents) {
      updateExpense(doc, library, expense.id, { amount_cents: parsed.cents });
    }
    return true;
  };

  return (
    <div className="flex flex-col gap-1">
      <input
        aria-label="金额"
        inputMode="decimal"
        autoFocus
        className="input h-8 w-24 tabular-nums"
        value={text}
        onChange={(event) => {
          setText(event.target.value);
          setError(null);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            if (!save()) return;
            settled.current = true;
            close(true);
          } else if (event.key === "Escape") {
            // 不保存：交给弹层关掉、焦点回到点开它的地方
            settled.current = true;
          }
        }}
        onBlur={() => {
          if (!settled.current) save();
        }}
      />
      {error !== null && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
