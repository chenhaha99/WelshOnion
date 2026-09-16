import {
  addExpense,
  countBlocksUsing,
  duplicateBlock,
  followersOf,
  shiftDayFrom,
  updateExpense,
  type BlockView,
  type ExpenseView,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";
import { useRef, useState } from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { blockFocusSelector, deleteBlockWithNotice, deleteLabel } from "./block-actions";
import { SHIFT_CHOICES } from "./block-shift";
import { useNotifyDeleted } from "./DeletedNotice";
import { CopyIcon, DetailsIcon, ShiftIcon, TrashIcon } from "./icons";
import { parseYuan } from "./money";
import { moneyCellLabel, type MoneyCell } from "./money-cells";
import { useOpenBlock } from "./open-block";
import { KindPicker, StatusPicker } from "./pickers";
import { useBlockSelection } from "./select-block";

const AMOUNT_ERROR = "要填不小于 0 的数，最多两位小数";
const SHIFT_LABEL = "这天从这件起往后推迟";

interface QuickBarProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  /** 选中的那件事 */
  block: BlockView;
  /** 它的钱格摘要（按筛选算过）；一笔钱都没挂是 undefined */
  moneyCell: MoneyCell | undefined;
}

/**
 * 选中一件事后浮出的快捷条：详情、类型、状态、钱、复制、推迟、删除。
 * 常改的几样在这里一两下就改完，不用开详情面板；没排时间的事没有「复制」「推迟」。
 * 摆在哪由外面决定：横排贴着这件事的右下角，竖排固定在屏幕底部。
 */
export function QuickBar({ doc, library, libraryView, plan, block, moneyCell }: QuickBarProps) {
  const selection = useBlockSelection();
  const openBlock = useOpenBlock();
  const notifyDeleted = useNotifyDeleted();
  const timed = block.start_minute !== null;
  const kinds = [...libraryView.kinds.values()].sort(byOrder);
  const statuses = [...libraryView.statuses.values()].sort(byOrder);
  const followerCount = followersOf(plan, libraryView, block.id).length;
  const deleteText = deleteLabel(followerCount);

  return (
    <div
      role="toolbar"
      aria-label={`「${block.title}」的操作`}
      data-quick-bar
      data-block-id={block.id}
      className="quick-bar"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          // 弹层开着时 Esc 先收弹层（弹层自己处理，传不到这里）；焦点在条上再按就是取消选中
          event.stopPropagation();
          selection.clear({ focusBlock: true });
        } else if (event.key === "Tab" && event.shiftKey && event.target === event.currentTarget.firstElementChild) {
          // 从条上第一个按钮往回走：回到这件事
          event.preventDefault();
          document.querySelector<HTMLElement>(blockFocusSelector(block.id))?.focus();
        }
      }}
    >
      <button
        type="button"
        aria-label="详情…"
        title="详情…"
        className="quick-button"
        onClick={(event) => openBlock(block.id, event.currentTarget)}
      >
        <DetailsIcon />
      </button>
      <KindPicker
        compact="fill"
        doc={doc}
        library={library}
        block={block}
        kinds={kinds}
        countUsing={(kindId) => countBlocksUsing(plan, { kindId })}
      />
      <StatusPicker
        compact="ring"
        doc={doc}
        library={library}
        block={block}
        statuses={statuses}
        countUsing={(statusId) => countBlocksUsing(plan, { statusId })}
      />
      <QuickMoney doc={doc} library={library} plan={plan} block={block} moneyCell={moneyCell} />
      {timed && (
        <button
          type="button"
          data-copy
          aria-label="复制"
          title="复制（按住拖到别处）"
          className="quick-button"
          onClick={() => {
            const result = duplicateBlock(doc, library, block.id, {
              baseId: block.start_base_id,
              minute: block.start_minute!,
              placement: "beside",
            });
            if (!result.ok) return;
            // 复制出来的那件接着选中：可以马上拖走，也可以接着复制
            const copyId = result.value.blockId;
            selection.select(copyId, selection.anchorBaseId);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-quick-bar][data-block-id="${copyId}"] [data-copy]`)?.focus();
            });
          }}
        >
          <CopyIcon />
        </button>
      )}
      {timed && (
        <Popover
          label={SHIFT_LABEL}
          triggerTitle={SHIFT_LABEL}
          trigger={<ShiftIcon />}
          triggerClassName="quick-button"
          role="dialog"
          panelLabel="推迟多久"
          panelClassName="menu flex gap-1.5 p-1.5"
          align="end"
          estimatedHeight={52}
        >
          {(close) =>
            SHIFT_CHOICES.map((choice) => (
              <button
                key={choice.minutes}
                type="button"
                className="btn btn-ghost h-8 px-3 tabular-nums"
                onClick={() => {
                  shiftDayFrom(doc, library, block.start_base_id, block.start_minute!, choice.minutes);
                  // 推完这件事还选中着，焦点回到「推迟」；推过 24 点换了一行时这条快捷条是新画的，再找一次
                  close(true);
                  requestAnimationFrame(() => {
                    if (document.activeElement !== null && document.activeElement !== document.body) return;
                    const shift = `[data-quick-bar][data-block-id="${block.id}"] button[aria-label="${SHIFT_LABEL}"]`;
                    document.querySelector<HTMLElement>(shift)?.focus();
                  });
                }}
              >
                {choice.label}
              </button>
            ))
          }
        </Popover>
      )}
      <button
        type="button"
        aria-label={deleteText}
        title={deleteText}
        className="quick-button text-danger"
        onClick={() => {
          const baseId = block.start_base_id;
          notifyDeleted(deleteBlockWithNotice(doc, library, block, followerCount));
          selection.clear();
          // 删完这件事没了：焦点落到这天的菜单（马上撤销得回来）
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-base-id="${baseId}"] button[aria-label="这天的操作"]`)?.focus();
          });
        }}
      >
        <TrashIcon />
      </button>
    </div>
  );
}

interface QuickMoneyProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  moneyCell: MoneyCell | undefined;
}

/**
 * 快捷条上的「钱」：一笔都没挂、或只挂着一笔自己的钱时，点了弹个只填金额的小框；
 * 挂着多笔、有共用的、按类型筛掉了一部分时，小框写不下，改为打开详情面板、展开钱的编辑区。
 */
function QuickMoney({ doc, library, plan, block, moneyCell }: QuickMoneyProps) {
  const openBlock = useOpenBlock();
  const label = `钱：${moneyCellLabel(moneyCell)}`;
  const attached = [...plan.expenses.values()].filter((expense) => expense.block_ids.includes(block.id));
  const only = attached.length === 1 && attached[0]!.block_ids.length === 1 ? attached[0]! : null;
  const simple = !moneyCell?.otherKinds && (attached.length === 0 || only !== null);

  if (!simple) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        className="quick-button tabular-nums"
        onClick={(event) => openBlock(block.id, event.currentTarget, "money")}
      >
        <span aria-hidden>¥</span>
      </button>
    );
  }
  return (
    <Popover
      label={label}
      triggerTitle={label}
      trigger={<span aria-hidden>¥</span>}
      triggerClassName="quick-button tabular-nums"
      role="dialog"
      panelLabel="改钱"
      panelClassName="menu p-2"
      align="end"
      estimatedHeight={80}
    >
      {(close) => <AmountBox doc={doc} library={library} block={block} expense={only} close={close} />}
    </Popover>
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
            // 不保存：交给弹层关掉、焦点回到「钱」
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

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}
