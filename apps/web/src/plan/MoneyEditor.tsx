import {
  addExpense,
  deleteExpense,
  linkExpense,
  unlinkExpense,
  updateExpense,
  type BlockView,
  type ExpenseView,
  type KindView,
  type PlanView,
} from "@welshonion/core";
import { useRef, useState, type KeyboardEvent } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { useNotifyDeleted } from "./DeletedNotice";
import { formatYuan, parseYuan } from "./money";
import { ExpenseKindPicker } from "./pickers";

const AMOUNT_ERROR = "要填不小于 0 的数，最多两位小数";

interface MoneyEditorProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  kinds: KindView[];
  countKindUsing: (kindId: string) => number;
  /** 编辑这块挂的开销；给 null 就是一个块都不挂的开销 */
  block: BlockView | null;
  label: string;
  /** 新一笔默认的类型 */
  defaultKindId: string;
  /** 「挂上已有的一笔」的选项；不给或是空的就不出这个下拉 */
  linkChoices?: ReadonlyArray<{ id: string; label: string }>;
  /** 收起：点「收起」、按 Esc 时调用，焦点交回打开它的按钮 */
  onDone: () => void;
}

/**
 * 开销的编辑区：每笔一行（类型、金额、人均或总价、说明、删除），末尾一行空的，填了才建；
 * 块的编辑区下面还能「挂上已有的一笔」；最后是「收起」。
 */
export function MoneyEditor({
  doc,
  library,
  plan,
  kinds,
  countKindUsing,
  block,
  label,
  defaultKindId,
  linkChoices,
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
        if (event.key !== "Escape") return;
        // 只收起编辑区、不往外传：在详情面板里按，面板不跟着关
        event.stopPropagation();
        onDone();
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
      {block !== null && linkChoices && linkChoices.length > 0 && (
        // 原生下拉：手机上点开是系统的选择列表。选了就挂上，值一直是空的，所以又回到第一项、焦点留着方便接着挂
        <select
          aria-label="挂上已有的一笔"
          className="input h-8 max-w-full self-start"
          value=""
          onChange={(event) => {
            const expenseId = event.target.value;
            if (expenseId === "") return;
            // 挂的是最后一笔：挂完下拉就不见了。先把焦点交给紧挨着的「收起」再挂，免得焦点掉到页面最外面
            if (linkChoices.length === 1) {
              event.currentTarget.closest("[role='group']")?.querySelector<HTMLButtonElement>("[data-money-done]")?.focus();
            }
            linkExpense(doc, expenseId, block.id);
          }}
        >
          <option value="">挂上已有的一笔…</option>
          {linkChoices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
      )}
      <button data-money-done type="button" className="btn btn-ghost h-8 self-start px-2" onClick={onDone}>
        收起
      </button>
    </div>
  );
}

interface ExpenseRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  expense: ExpenseView;
  kinds: KindView[];
  countKindUsing: (kindId: string) => number;
  /** 在哪块的编辑区里；不属于任何一天的编辑区给 null */
  blockId: string | null;
}

/**
 * 一笔开销一行：类型、金额、人均或总价、说明，共用时能从这件事拿掉，删除这笔。块的编辑区、不属于任何一天的编辑区共用。
 * 分两组：类型、金额、人均或总价一组，说明往后一组；放不下时第二组整个换到下一行，不会把「总价」和金额拆开。
 */
function ExpenseRow({ doc, library, expense, kinds, countKindUsing, blockId }: ExpenseRowProps) {
  const notifyDeleted = useNotifyDeleted();
  const shared = blockId !== null && expense.block_ids.length > 1;
  return (
    <div data-expense-id={expense.id} className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
      <div className="flex items-center gap-2">
        {/* 安排表放不下 42rem 时，index.css 把这一格和空行的「加一笔」一起收窄 */}
        <div data-kind-cell className="w-28">
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
      </div>
      <div className="flex min-w-[12rem] flex-1 flex-wrap items-center gap-2">
        <div className="min-w-32 flex-1">
          <CommitInput
            label="说明"
            showLabel={false}
            placeholder="说明"
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
            <span className="text-xs text-ink-muted">也挂在别的事上</span>
            <button
              type="button"
              className="btn btn-ghost h-8 px-2"
              onClick={() => unlinkExpense(doc, expense.id, blockId)}
            >
              从这件事拿掉
            </button>
          </>
        )}
        {/* 删一笔开销不确认，靠撤销：删完在屏幕底部说删了哪笔、能撤销 */}
        <button
          type="button"
          className="btn btn-ghost h-8 px-2 text-danger"
          onClick={() => {
            deleteExpense(doc, expense.id);
            notifyDeleted({
              message: deletedMessage(expense),
              focusAfterUndo: `[data-expense-id="${expense.id}"] input[aria-label="金额"]`,
            });
          }}
        >
          删除这笔
        </button>
      </div>
    </div>
  );
}

/** 删完的提示怎么说这笔开销：有说明说说明，没说明说金额。 */
function deletedMessage(expense: ExpenseView): string {
  if (expense.title !== "") return `删掉了「${expense.title}」这笔开销`;
  if (expense.amount_cents !== null) return `删掉了 ${formatYuan(expense.amount_cents)} 这笔开销`;
  return "删掉了一笔开销";
}

interface DraftRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  blockId: string | null;
  defaultKindId: string;
  autoFocus: boolean;
}

/**
 * 末尾那行空的：金额或说明填了一格、按回车或焦点离开这一行时才建这笔开销。
 * 只在离开整行时提交，免得填完金额跳去填说明时先建出一笔、填完说明又建一笔。
 * 按 Esc 是不要了：清空，接着焦点离开也不建。
 */
function DraftRow({ doc, library, blockId, defaultKindId, autoFocus }: DraftRowProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 按了 Esc、还没再填字：这时焦点离开不建（编辑区收起时焦点会回到打开它的按钮）
  const discarding = useRef(false);

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
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          discarding.current = true;
          setAmount("");
          setNote("");
          setError(null);
        }}
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
          if (discarding.current) {
            discarding.current = false;
            return;
          }
          submit();
        }}
      >
        <span data-draft-lead className="w-28 pl-1 text-xs text-ink-muted">
          加一笔
        </span>
        <input
          aria-label="新一笔的金额"
          placeholder="金额（元）"
          inputMode="decimal"
          autoFocus={autoFocus}
          className="input h-8 w-24 tabular-nums"
          value={amount}
          onChange={(event) => {
            discarding.current = false;
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
          onChange={(event) => {
            discarding.current = false;
            setNote(event.target.value);
          }}
          onKeyDown={submitOnEnter}
        />
      </div>
      {error && <p className="pl-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
