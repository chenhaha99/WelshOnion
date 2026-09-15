import {
  countBlocksUsing,
  followersOf,
  passesFilter,
  updateBlock,
  type BlockView,
  type KindView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
  type StatusView,
} from "@welshonion/core";
import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { Menu, type MenuItem } from "../app/Menu";
import { AddBlock, addKindIdFor, useJustAdded } from "./AddBlock";
import { deleteBlockWithNotice, deleteLabel, undatedArrangeItems } from "./block-actions";
import { blockTimeLabel } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { useNotifyDeleted } from "./DeletedNotice";
import { linkableExpenses } from "./expense-links";
import { MoneyEditor } from "./MoneyEditor";
import { moneyCellEmpty, moneyCellLabel, moneyCellNote, type MoneyCell } from "./money-cells";
import { useOpenBlock } from "./open-block";
import { KindPicker, StatusPicker } from "./pickers";
import { TimeEditor } from "./TimeEditor";
import { zoneTimeLabel } from "./zone-time";

const DELETED_COLOR = "#9aa3ad";
const COLUMN_COUNT = 6;

interface BlockTableProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  baseId: string;
  date: string;
  dayLabel: string;
  /** 全计划的钱格摘要，按块 id */
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
  /** 这天一行都不剩时把焦点交出去（落到这天的菜单按钮） */
  onEmptyFocus: () => void;
}

/** 焦点最后在哪一行、这一行的哪个位置（读屏名里「：」前面那段，比如「状态：」「这件事的操作」）。 */
interface FocusSpot {
  blockId: string;
  index: number;
  control: string;
}

/**
 * 一天的安排表：一行一个块，末尾「加一件事」。带筛选时只画通过的块，写「筛掉了 N 件」。
 * 一行消失（改状态被筛掉、删除）而焦点掉到页面最外面时，焦点落到下一行的同一个位置，没有下一行就上一行，都没有就交给这天的组头。
 */
export function BlockTable({
  doc,
  library,
  libraryView,
  plan,
  baseId,
  date,
  dayLabel,
  moneyCells,
  filter,
  onEmptyFocus,
}: BlockTableProps) {
  const dayBlocks = blocksOfDay(plan, baseId);
  const blocks = dayBlocks.filter((block) => passesFilter(block, filter));
  const hiddenCount = dayBlocks.length - blocks.length;
  const tbody = useRef<HTMLTableSectionElement>(null);
  const focusSpot = useRef<FocusSpot | null>(null);
  // 这天最近加的那件被筛掉了，「筛掉了 N 件」后面写上它
  const justAdded = useJustAdded(dayBlocks, blocks, filter);

  // 弹出去的选择器、菜单不在表格里：焦点在那里时不改记录，记的还是打开它的那个按钮
  const rememberFocus = (event: FocusEvent<HTMLTableSectionElement>) => {
    const target = event.target;
    const row = target.closest<HTMLElement>("tr[data-block-id]");
    const label = target.getAttribute("aria-label");
    if (!row || !label || !event.currentTarget.contains(row)) return;
    const blockId = row.dataset.blockId!;
    focusSpot.current = { blockId, index: blocks.findIndex((block) => block.id === blockId), control: controlKey(label) };
  };

  const visibleIds = blocks.map((block) => block.id).join(",");
  useLayoutEffect(() => {
    const spot = focusSpot.current;
    if (!spot || blocks.some((block) => block.id === spot.blockId)) return;
    focusSpot.current = null;
    if (document.activeElement !== null && document.activeElement !== document.body) return;
    const next = blocks[Math.min(spot.index, blocks.length - 1)];
    // 一行都不剩时不落到「加一件事」：焦点在输入框里时 Ctrl+Z 撤销的是输入框里的字，删完想马上撤销会没反应
    if (!next) {
      onEmptyFocus();
      return;
    }
    tbody.current?.querySelector<HTMLElement>(`tr[data-block-id="${next.id}"] ${controlSelector(spot.control)}`)?.focus();
    // 只在显示的行变了时看一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleIds]);
  const kinds = [...libraryView.kinds.values()].sort(byOrder);
  const statuses = [...libraryView.statuses.values()].sort(byOrder);
  const countKindUsing = (kindId: string) => countBlocksUsing(plan, { kindId });
  const countStatusUsing = (statusId: string) => countBlocksUsing(plan, { statusId });

  return (
    // 外层是量宽度的容器：放不下 42rem 的表格时，index.css 把一行换成一张卡
    <div className="@container -mx-2 overflow-x-auto">
      <table aria-label={`${dayLabel} 的安排`} className="block-table w-full min-w-[42rem]">
        <thead className="sr-only">
          <tr>
            <th>标题</th>
            <th>类型</th>
            <th>状态</th>
            <th>时间</th>
            <th>钱</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody ref={tbody} onFocus={rememberFocus}>
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              doc={doc}
              library={library}
              plan={plan}
              block={block}
              date={date}
              kinds={kinds}
              statuses={statuses}
              followerCount={followersOf(plan, libraryView, block.id).length}
              countKindUsing={countKindUsing}
              countStatusUsing={countStatusUsing}
              moneyCell={moneyCells.get(block.id)}
            />
          ))}
          {hiddenCount > 0 && (
            <tr data-filtered-out>
              <td colSpan={COLUMN_COUNT} className="text-sm text-ink-muted">
                筛掉了 {hiddenCount} 件
                {justAdded.hidden !== undefined && `，包括刚加的「${justAdded.hidden.title}」`}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={COLUMN_COUNT}>
              <AddBlock
                doc={doc}
                library={library}
                baseId={baseId}
                kindId={addKindIdFor(filter)}
                onAdded={justAdded.remember}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

interface BlockRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  date: string;
  kinds: KindView[];
  statuses: StatusView[];
  /** 删除时会被一起带走的块数 */
  followerCount: number;
  countKindUsing: (kindId: string) => number;
  countStatusUsing: (statusId: string) => number;
  /** 这块的钱格摘要；一笔钱都没挂就是 undefined */
  moneyCell: MoneyCell | undefined;
}

function BlockRow({
  doc,
  library,
  plan,
  block,
  date,
  kinds,
  statuses,
  followerCount,
  countKindUsing,
  countStatusUsing,
  moneyCell,
}: BlockRowProps) {
  const [timeOpen, setTimeOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const row = useRef<HTMLTableRowElement>(null);
  const notifyDeleted = useNotifyDeleted();
  const openBlock = useOpenBlock();
  const color = block.kind.deleted ? DELETED_COLOR : block.kind.color;
  const indent = block.indent ?? 0;
  const undated = block.start_minute === null;

  // 删除不再确认，靠撤销：删完在屏幕底部说删了什么、能撤销；套着块时写明会一起删几个
  const deleteItem: MenuItem = {
    label: deleteLabel(followerCount),
    danger: true,
    onSelect: () => notifyDeleted(deleteBlockWithNotice(doc, library, block, followerCount)),
  };
  // 「详情…」打开详情面板（时间轴上点开的也是它），焦点放在短备注；关掉后焦点回到这一行的行菜单按钮
  const detailsItem: MenuItem = {
    label: "详情…",
    onSelect: () =>
      openBlock(block.id, row.current!.querySelector<HTMLElement>("button[aria-label='这件事的操作']")!, "subtitle"),
  };
  // 收起时间的编辑区后焦点回到「时间」按钮；换了天的，这一行画到了那天的表里，等画完再找一次
  const closeTime = () => {
    row.current?.querySelector<HTMLElement>("button[aria-label='时间']")?.focus();
    setTimeOpen(false);
    requestAnimationFrame(() => {
      const button = document.querySelector<HTMLElement>(`tr[data-block-id="${block.id}"] button[aria-label="时间"]`);
      if (button !== document.activeElement) button?.focus();
    });
  };
  // 收起钱的编辑区后焦点回到钱格；先挪焦点，空行里填了没回车的借这次离开建上（按 Esc 的在空行里就放弃了）
  const closeMoney = () => {
    row.current?.querySelector<HTMLElement>("button[aria-label='钱']")?.focus();
    setMoneyOpen(false);
  };
  const subtitleLine = [block.subtitle, block.note === null ? null : "有长备注"].filter((part) => part !== null).join(" · ");
  const moneyNote = moneyCellNote(moneyCell);
  const items: MenuItem[] = undated
    ? [...undatedArrangeItems(doc, plan, block), detailsItem, deleteItem]
    : [detailsItem, deleteItem];

  return (
    <>
      <tr
        ref={row}
        data-block-id={block.id}
        data-pending={block.status.id === "pending"}
        className="block-row"
        style={{ "--kind-color": color, "--indent": indent } as CSSProperties}
      >
        <td data-indent={indent}>
          <CommitInput
            label="标题"
            showLabel={false}
            value={block.title}
            className="input-bare"
            commit={(text) => {
              // 清空不保存，恢复原标题
              if (text !== "" && text !== block.title) updateBlock(doc, library, block.id, { title: text });
              return null;
            }}
          />
          {subtitleLine !== "" && (
            <p data-block-subtitle className="truncate px-2 text-xs text-ink-muted">
              {subtitleLine}
            </p>
          )}
        </td>
        <td className="w-32">
          <KindPicker doc={doc} library={library} block={block} kinds={kinds} countUsing={countKindUsing} />
        </td>
        <td className="w-28">
          <StatusPicker doc={doc} library={library} block={block} statuses={statuses} countUsing={countStatusUsing} />
        </td>
        <td className="w-40">
          <button
            type="button"
            aria-label="时间"
            aria-expanded={timeOpen}
            className="input-bare text-left text-sm whitespace-nowrap text-ink-muted"
            onClick={() => setTimeOpen((value) => !value)}
          >
            <span data-block-time className="tabular-nums">
              {zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}
            </span>
          </button>
        </td>
        <td className="w-36">
          {/* 没钱可显示时淡色的「填钱」：空格子本身就是还没填的进度；按类型筛时，别的类型的钱在下面另写一行 */}
          <button
            type="button"
            aria-label="钱"
            aria-expanded={moneyOpen}
            className={`input-bare text-left text-sm whitespace-nowrap tabular-nums ${moneyCellEmpty(moneyCell) ? "text-ink-muted/60" : "text-ink"}`}
            onClick={() => setMoneyOpen((value) => !value)}
          >
            <span data-money-cell>{moneyCellLabel(moneyCell)}</span>
            {moneyNote !== null && (
              <span data-money-note className="block text-xs text-ink-muted">
                {moneyNote}
              </span>
            )}
          </button>
        </td>
        <td className="w-12 text-right">
          <Menu label="这件事的操作" items={items}>
            ⋯
          </Menu>
        </td>
      </tr>
      {timeOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT}>
            <TimeEditor doc={doc} library={library} plan={plan} block={block} onDone={closeTime} />
          </td>
        </tr>
      )}
      {moneyOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT}>
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
          </td>
        </tr>
      )}
    </>
  );
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}

/** 读屏名里「：」前面那段当位置：「状态：待定」「状态：已确认」是同一个位置。 */
function controlKey(label: string): string {
  const colon = label.indexOf("：");
  return colon === -1 ? label : label.slice(0, colon + 1);
}

function controlSelector(control: string): string {
  return control.endsWith("：") ? `[aria-label^="${control}"]` : `[aria-label="${control}"]`;
}
