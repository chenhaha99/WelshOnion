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
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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
  /** 编辑这块挂的钱；给 null 就是一个块都不挂的钱 */
  block: BlockView | null;
  label: string;
  /** 新一笔默认的类型 */
  defaultKindId: string;
  /** 收起：点「收起」、按 Esc 时调用，焦点交回打开它的按钮 */
  onDone: () => void;
}

/** 钱的编辑区：每笔一行（类型、金额、人均或总价、说明、删除），末尾一行空的，填了才建；最后是「收起」。 */
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
      <button type="button" className="btn btn-ghost h-8 self-start px-2" onClick={onDone}>
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
  /** 在哪块的编辑区里；不挂块的钱、按类型分组时给 null */
  blockId: string | null;
  /** 按类型分组时写「挂在 10.1 周四 民宿」或「不挂块」；按天时不给 */
  blocksLabel?: string;
}

/**
 * 一笔钱一行：类型、金额、人均或总价、说明，共用时能从这块拿掉，删除这笔。按天的编辑区、按类型分组共用。
 * 分两组：类型、金额、人均或总价一组，说明往后一组；放不下时第二组整个换到下一行，不会把「总价」和金额拆开。
 */
export function ExpenseRow({ doc, library, expense, kinds, countKindUsing, blockId, blocksLabel }: ExpenseRowProps) {
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
        {blocksLabel !== undefined && (
          <span data-expense-blocks className="text-xs text-ink-muted">
            {blocksLabel}
          </span>
        )}
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
        {/* 删一笔钱不确认，靠撤销：删完在屏幕底部说删了哪笔、能撤销 */}
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

/** 删完的提示怎么说这笔钱：有说明说说明，没说明说金额。 */
function deletedMessage(expense: ExpenseView): string {
  if (expense.title !== "") return `删掉了「${expense.title}」这笔钱`;
  if (expense.amount_cents !== null) return `删掉了 ${formatYuan(expense.amount_cents)} 这笔钱`;
  return "删掉了一笔钱";
}

interface DraftRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  blockId: string | null;
  defaultKindId: string;
  autoFocus: boolean;
  /** 前面那一截字：默认「加一笔」；按类型分组的空行写块 */
  lead?: ReactNode;
  /** 给了就多一个「挂到」下拉：第一项「不挂块」，建出来挂在选的块上（这时不看 blockId） */
  blockChoices?: ReadonlyArray<{ id: string; label: string }>;
  /** 给了就多一个「类型」下拉，默认选 defaultKindId */
  kindChoices?: ReadonlyArray<{ id: string; name: string }>;
}

/**
 * 末尾那行空的：金额或说明填了一格、按回车或焦点离开这一行时才建这笔钱。
 * 只在离开整行时提交，免得填完金额跳去填说明时先建出一笔、填完说明又建一笔。
 * 按 Esc 是不要了：清空，接着焦点离开也不建。
 */
export function DraftRow({
  doc,
  library,
  blockId,
  defaultKindId,
  autoFocus,
  lead,
  blockChoices,
  kindChoices,
}: DraftRowProps) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [target, setTarget] = useState("");
  const [kindId, setKindId] = useState(defaultKindId);
  const [error, setError] = useState<string | null>(null);
  // 按了 Esc、还没再填字：这时焦点离开不建（编辑区收起时焦点会回到打开它的按钮）
  const discarding = useRef(false);
  // 筛选变了、选过的块或类型不在选项里了：块回到「不挂块」，类型换成第一个，免得建出来看不见
  const chosenTarget = blockChoices?.some((choice) => choice.id === target) ? target : "";
  const chosenKind =
    kindChoices && !kindChoices.some((kind) => kind.id === kindId) ? (kindChoices[0]?.id ?? defaultKindId) : kindId;

  const submit = () => {
    const amountText = amount.trim();
    const noteText = note.trim();
    if (amountText === "" && noteText === "") return;
    const parsed = parseYuan(amountText);
    if (!parsed.ok) {
      setError(AMOUNT_ERROR);
      return;
    }
    const attachTo = blockChoices ? chosenTarget : (blockId ?? "");
    addExpense(doc, library, {
      title: noteText,
      amountCents: parsed.cents,
      blockIds: attachTo === "" ? [] : [attachTo],
      kindId: kindChoices ? chosenKind : defaultKindId,
    });
    setAmount("");
    setNote("");
    // 挂到不留着上一次的选择：连着加时容易挂错块；类型留着，方便连着加同一类
    setTarget("");
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
          {lead ?? "加一笔"}
        </span>
        {kindChoices && (
          <select
            aria-label="类型"
            className="input h-8"
            value={chosenKind}
            onChange={(event) => setKindId(event.target.value)}
          >
            {kindChoices.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.name}
              </option>
            ))}
          </select>
        )}
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
        {blockChoices && (
          <select
            aria-label="挂到"
            className="input h-8 max-w-full"
            value={chosenTarget}
            onChange={(event) => setTarget(event.target.value)}
          >
            <option value="">不挂块</option>
            {blockChoices.map((choice) => (
              <option key={choice.id} value={choice.id}>
                {choice.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {error && <p className="pl-1 text-sm text-danger">{error}</p>}
    </div>
  );
}
