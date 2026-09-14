import {
  addExpense,
  deleteExpense,
  unlinkExpense,
  updateExpense,
  type BlockView,
  type ExpenseView,
  type KindView,
  type PlanView,
} from "@welshonion/core";
import { useState, type KeyboardEvent } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { parseYuan } from "./money";
import { ExpenseKindPicker } from "./pickers";

const AMOUNT_ERROR = "要填不小于 0 的数，最多两位小数";

interface MoneyEditorProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  kinds: KindView[];
  countKindUsing: (kindId: string) => number;
  /** 编辑这块挂的钱；给 null 就是一个块都不挂的钱 */
  block: BlockView | null;
  label: string;
  /** 新一笔默认的类型 */
  defaultKindId: string;
  onDone: () => void;
}

/** 钱的编辑区：每笔一行（类型、金额、人均或总价、说明、删除），末尾一行空的，填了才建。 */
export function MoneyEditor({
  doc,
  library,
  plan,
  kinds,
  countKindUsing,
  block,
  label,
  defaultKindId,
  onDone,
}: MoneyEditorProps) {
  const expenses = [...plan.expenses.values()].filter((expense) =>
    block === null ? expense.block_ids.length === 0 : expense.block_ids.includes(block.id),
  );

  return (
    <div
      role="group"
      aria-label={label}
      className="flex flex-col gap-1.5 py-1 pl-2 text-sm"
      onKeyDown={(event) => {
        if (event.key === "Escape") onDone();
      }}
    >
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          doc={doc}
          library={library}
          expense={expense}
          kinds={kinds}
          countKindUsing={countKindUsing}
          blockId={block?.id ?? null}
        />
      ))}
      <DraftRow
        doc={doc}
        library={library}
        blockId={block?.id ?? null}
        defaultKindId={defaultKindId}
        autoFocus={expenses.length === 0}
      />
    </div>
  );
}

interface ExpenseRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  expense: ExpenseView;
  kinds: KindView[];
  countKindUsing: (kindId: string) => number;
  /** 在哪块的编辑区里；不挂块的钱给 null */
  blockId: string | null;
}

function ExpenseRow({ doc, library, expense, kinds, countKindUsing, blockId }: ExpenseRowProps) {
  const shared = blockId !== null && expense.block_ids.length > 1;
  return (
    <div data-expense-id={expense.id} className="flex flex-wrap items-center gap-2">
      <div className="w-28">
        <ExpenseKindPicker doc={doc} library={library} expense={expense} kinds={kinds} countUsing={countKindUsing} />
      </div>
      <div className="w-24">
        <CommitInput
          label="金额"
          showLabel={false}
          inputMode="decimal"
          className="input h-8 w-full tabular-nums"
          value={expense.amount_cents === null ? "" : String(expense.amount_cents / 100)}
          commit={(text) => {
            const parsed = parseYuan(text);
            if (!parsed.ok) return AMOUNT_ERROR;
            if (parsed.cents !== expense.amount_cents) {
              updateExpense(doc, library, expense.id, { amount_cents: parsed.cents });
            }
            return null;
          }}
        />
      </div>
      <select
        aria-label="算法"
        className="input h-8"
        value={expense.basis}
        onChange={(event) =>
          updateExpense(doc, library, expense.id, {
            basis: event.target.value === "per_person" ? "per_person" : "total",
          })
        }
      >
        <option value="total">总价</option>
        <option value="per_person">人均</option>
      </select>
      <div className="min-w-32 flex-1">
        <CommitInput
          label="说明"
          showLabel={false}
          className="input h-8 w-full"
          value={expense.title}
          commit={(text) => {
            if (text !== expense.title) updateExpense(doc, library, expense.id, { title: text });
            return null;
          }}
        />
      </div>
      {shared && blockId !== null && (
        <>
          <span className="text-xs text-ink-muted">也挂在别的块上</span>
          <button
            type="button"
            className="btn btn-ghost h-8 px-2"
            onClick={() => unlinkExpense(doc, expense.id, blockId)}
          >
            从这块拿掉
          </button>
        </>
      )}
      {/* 删一笔钱不确认，靠撤销 */}
      <button type="button" className="btn btn-ghost h-8 px-2 text-danger" onClick={() => deleteExpense(doc, expense.id)}>
        删除这笔
      </button>
    </div>
  );
}

interface DraftRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  blockId: string | null;
  defaultKindId: string;
  autoFocus: boolean;
}

/**
 * 末尾那行空的：金额或说明填了一格、按回车或焦点离开这一行时才建这笔钱。
 * 只在离开整行时提交，免得填完金额跳去填说明时先建出一笔、填完说明又建一笔。
 */
function DraftRow({ doc, library, blockId, defaultKindId, autoFocus }: DraftRowProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const amountText = amount.trim();
    const noteText = note.trim();
    if (amountText === "" && noteText === "") return;
    const parsed = parseYuan(amountText);
    if (!parsed.ok) {
      setError(AMOUNT_ERROR);
      return;
    }
    addExpense(doc, library, {
      title: noteText,
      amountCents: parsed.cents,
      blockIds: blockId === null ? [] : [blockId],
      kindId: defaultKindId,
    });
    setAmount("");
    setNote("");
    setError(null);
  };

  const submitOnEnter = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex flex-wrap items-center gap-2"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) submit();
        }}
      >
        <span className="w-28 pl-1 text-xs text-ink-muted">加一笔</span>
        <input
          aria-label="新一笔的金额"
          placeholder="金额（元）"
          inputMode="decimal"
          autoFocus={autoFocus}
          className="input h-8 w-24 tabular-nums"
          value={amount}
          onChange={(event) => {
            setAmount(event.target.value);
            setError(null);
          }}
          onKeyDown={submitOnEnter}
        />
        <input
          aria-label="新一笔的说明"
          placeholder="说明"
          className="input h-8 min-w-32 flex-1"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          onKeyDown={submitOnEnter}
        />
      </div>
      {error && <p className="pl-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
