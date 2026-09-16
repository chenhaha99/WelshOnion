import {
  countBlocksUsing,
  duplicateBlock,
  followersOf,
  setBlockLayer,
  shiftDayFrom,
  updateBlock,
  type BlockView,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";
import { useId, useRef, useState } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { Drawer } from "../app/Drawer";
import { BlockDetails } from "./BlockDetails";
import { deleteBlockWithNotice, deleteLabel, undatedArrangeItems } from "./block-actions";
import { SHIFT_CHOICES } from "./block-shift";
import { layerChoices, STACKED } from "./block-layer-choices";
import { blockTimeLabel, durationLabel } from "./block-time";
import { dayRowLabels } from "./day-labels";
import { useNotifyDeleted } from "./DeletedNotice";
import { linkableExpenses } from "./expense-links";
import { MoneyEditor } from "./MoneyEditor";
import { moneyCellEmpty, moneyCellLabel, moneyCellNote, type MoneyCell } from "./money-cells";
import type { PanelFocus } from "./open-block";
import { KindPicker, StatusPicker } from "./pickers";
import { TimeEditor } from "./TimeEditor";
import { zoneTimeLabel } from "./zone-time";

/** 左边一栏字、右边一栏控件 */
const FIELD_ROW = "grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2 text-sm";

interface BlockPanelProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  block: BlockView;
  /** 这件事的钱格摘要（按筛选算过）；一笔钱都没挂是 undefined */
  moneyCell: MoneyCell | undefined;
  focus: PanelFocus;
  /** 关掉面板；删掉了这件事时给它那天的底座 id，焦点好落到那天 */
  onClose: (deletedFromBaseId?: string) => void;
}

/**
 * 一件事的详情面板：时间轴上点开的、列表「详情…」打开的都是它；电脑上在右边、手机上占满屏幕（见 Drawer）。
 * 从上往下：标题；类型、状态、时间、钱（时间、钱点开是和列表同一个编辑区，收起后焦点回到各自的按钮）；
 * 排上时间的推迟、放在哪、复制到；短备注、路程、长备注；没排时间的缩进、上移、下移；删除。
 */
export function BlockPanel({ doc, library, libraryView, plan, block, moneyCell, focus, onClose }: BlockPanelProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  // 快捷条上的「钱」写不下多笔、共用时改开这里，一打开就是摊开的钱
  const [moneyOpen, setMoneyOpen] = useState(focus === "money");
  const timeButton = useRef<HTMLButtonElement>(null);
  const moneyButton = useRef<HTMLButtonElement>(null);
  const arrangeGroup = useRef<HTMLDivElement>(null);
  const shiftLabelId = useId();
  const notifyDeleted = useNotifyDeleted();

  const timed = block.start_minute !== null;
  const kinds = [...libraryView.kinds.values()].sort(byOrder);
  const statuses = [...libraryView.statuses.values()].sort(byOrder);
  const countKindUsing = (kindId: string) => countBlocksUsing(plan, { kindId });
  const countStatusUsing = (statusId: string) => countBlocksUsing(plan, { statusId });
  const followerCount = followersOf(plan, libraryView, block.id).length;
  const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
  const time = zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date);
  const duration = block.duration_min ?? 0;
  // 没排时间的块，时间格的字里已经带着时长
  const timeText = !timed || duration === 0 ? time : `${time} · ${durationLabel(duration)}`;
  const moneyNote = moneyCellNote(moneyCell);
  const layers = layerChoices(plan, libraryView, block);

  const closeTime = () => {
    timeButton.current?.focus();
    setTimeOpen(false);
  };
  // 先挪焦点，钱的空行里填了没回车的借这次离开建上（按 Esc 的在空行里就放弃了）
  const closeMoney = () => {
    moneyButton.current?.focus();
    setMoneyOpen(false);
  };
  // 上移、下移到了头，那个按钮不能点了，焦点会丢：挪到这一组里还能点的按钮上
  const keepArrangeFocus = () => {
    requestAnimationFrame(() => {
      const group = arrangeGroup.current;
      if (!group) return;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && group.contains(active) && !active.disabled) return;
      group.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  };

  return (
    <Drawer
      title={block.title}
      onClose={() => onClose()}
      initialFocus={(panel) => {
        if (focus === "panel") return panel;
        const group = focus === "money" ? " 的钱" : " 的详情";
        return panel.querySelector<HTMLElement>(`[role="group"][aria-label$="${group}"] input`);
      }}
    >
      <CommitInput
        label="标题"
        value={block.title}
        commit={(text) => {
          // 清空不保存，恢复原标题
          if (text !== "" && text !== block.title) updateBlock(doc, library, block.id, { title: text });
          return null;
        }}
      />
      <div className="flex flex-col gap-1">
        <div className={FIELD_ROW}>
          <span className="text-ink-muted">类型</span>
          <KindPicker doc={doc} library={library} block={block} kinds={kinds} countUsing={countKindUsing} />
        </div>
        <div className={FIELD_ROW}>
          <span className="text-ink-muted">状态</span>
          <StatusPicker doc={doc} library={library} block={block} statuses={statuses} countUsing={countStatusUsing} />
        </div>
        <div className={FIELD_ROW}>
          <span className="text-ink-muted">时间</span>
          <button
            ref={timeButton}
            type="button"
            aria-label="时间"
            aria-expanded={timeOpen}
            // 画成框：面板里一眼看得出点了能改（列表的行里是一格，本来就像能点）
            className="input h-auto min-h-9 w-full py-1.5 text-left text-ink tabular-nums"
            onClick={() => setTimeOpen((open) => !open)}
          >
            {timeText}
          </button>
        </div>
        {timeOpen && <TimeEditor doc={doc} library={library} plan={plan} block={block} onDone={closeTime} />}
        <div className={FIELD_ROW}>
          <span className="text-ink-muted">钱</span>
          <button
            ref={moneyButton}
            type="button"
            aria-label="钱"
            aria-expanded={moneyOpen}
            className={`input h-auto min-h-9 w-full py-1.5 text-left tabular-nums ${moneyCellEmpty(moneyCell) ? "text-ink-muted" : "text-ink"}`}
            onClick={() => setMoneyOpen((open) => !open)}
          >
            <span>{moneyCellLabel(moneyCell)}</span>
            {moneyNote !== null && <span className="block text-xs text-ink-muted">{moneyNote}</span>}
          </button>
        </div>
        {moneyOpen && (
          <MoneyEditor
            doc={doc}
            library={library}
            plan={plan}
            kinds={kinds}
            countKindUsing={countKindUsing}
            block={block}
            label={`${block.title} 的钱`}
            // 块的类型被删了时，新一笔先记成「其他」
            defaultKindId={block.kind.deleted ? "other" : block.kind.id}
            linkChoices={linkableExpenses(plan, block.id)}
            onDone={closeMoney}
          />
        )}
      </div>

      {timed && (
        <div role="group" aria-labelledby={shiftLabelId} className="flex flex-col gap-1.5 text-sm">
          <span id={shiftLabelId} className="text-ink-muted">
            这天从这件起往后推迟
          </span>
          <div className="flex flex-wrap gap-1.5">
            {SHIFT_CHOICES.map((choice) => (
              <button
                key={choice.minutes}
                type="button"
                className="inline-flex h-8 items-center rounded-full border border-ink/10 bg-white/70 px-3 text-ink tabular-nums hover:border-sage focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
                onClick={() => {
                  shiftDayFrom(doc, library, block.start_base_id, block.start_minute!, choice.minutes);
                  // 行中晚点了是点开、点推迟两下：推完就关，焦点回到点开它的地方
                  onClose();
                }}
              >
                {choice.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {timed && (
        <div className="flex flex-col gap-1.5">
          {layers !== null && (
            <div className={FIELD_ROW}>
              <span className="text-ink-muted">放在哪</span>
              <select
                aria-label="放在哪"
                className="input min-w-0"
                value={layers.current}
                onChange={(event) =>
                  setBlockLayer(doc, library, block.id, event.target.value === "" ? null : event.target.value)
                }
              >
                <option value="">单独一道</option>
                {layers.current === STACKED && (
                  <option value={STACKED} disabled>
                    叠着
                  </option>
                )}
                {layers.targets.map((target) => (
                  <option key={target.id} value={target.id}>
                    {`叠在「${target.title}」上`}
                  </option>
                ))}
              </select>
            </div>
          )}
          <CopyTo doc={doc} library={library} plan={plan} block={block} />
        </div>
      )}

      <BlockDetails doc={doc} library={library} block={block} />

      {!timed && (
        <div ref={arrangeGroup} role="group" aria-label="排先后" className="flex flex-wrap gap-1.5">
          {undatedArrangeItems(doc, plan, block).map((item, index) => (
            // 按位置当 key：「缩进」换成「取消缩进」还是同一个按钮，焦点不丢
            <button
              key={index}
              type="button"
              className="btn btn-ghost h-8 px-3"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                keepArrangeFocus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        className="btn btn-ghost self-start px-3 text-danger"
        onClick={() => {
          notifyDeleted(deleteBlockWithNotice(doc, library, block, followerCount));
          onClose(block.start_base_id);
        }}
      >
        {deleteLabel(followerCount)}
      </button>
    </Drawer>
  );
}

interface CopyToProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
}

/** 「复制到」：选一天就在那天同一个开始时刻复制一份（连同里面的事和钱），面板留着，下面写复制到了哪天。 */
function CopyTo({ doc, library, plan, block }: CopyToProps) {
  // 复制到了哪天（底座 id）；那天后来删了就不写
  const [copiedTo, setCopiedTo] = useState<string | null>(null);
  const labels = dayRowLabels(plan.bases);
  const copiedIndex = plan.bases.findIndex((base) => base.id === copiedTo);
  return (
    <div className="flex flex-col gap-1">
      <div className={FIELD_ROW}>
        <span className="text-ink-muted">复制到</span>
        {/* 选了就复制；值一直是空的，又回到「选一天」，可以接着复制到别的天 */}
        <select
          aria-label="复制到"
          className="input min-w-0"
          value=""
          onChange={(event) => {
            duplicateBlock(doc, library, block.id, {
              baseId: event.target.value,
              minute: block.start_minute!,
              placement: "auto",
            });
            setCopiedTo(event.target.value);
          }}
        >
          <option value="" disabled>
            选一天
          </option>
          {plan.bases.map((base, index) => (
            <option key={base.id} value={base.id}>
              {labels[index]}
            </option>
          ))}
        </select>
      </div>
      <p aria-live="polite" className="text-xs text-ink-muted">
        {copiedIndex >= 0 ? `复制到了${labels[copiedIndex]}` : null}
      </p>
    </div>
  );
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}
