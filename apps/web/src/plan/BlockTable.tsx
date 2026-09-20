import {
  countBlocksUsing,
  followersOf,
  freeGaps,
  passesFilter,
  updateBlock,
  type BlockView,
  type KindView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
  type TagView,
} from "@welshonion/core";
import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { Menu, type MenuItem } from "../app/Menu";
import { AddAtTime } from "./AddAtTime";
import { AddBlock, addKindIdFor, addTagIdsFor, useJustAdded } from "./AddBlock";
import { deleteBlockWithNotice, deleteLabel, undatedArrangeItems } from "./block-actions";
import { blockTimeLabel, clock, durationLabel } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { useNotifyDeleted } from "./DeletedNotice";
import { linkableExpenses } from "./expense-links";
import { MoneyEditor } from "./MoneyEditor";
import { moneyCellEmpty, moneyCellLabel, moneyCellNote, type MoneyCell } from "./money-cells";
import { MarkButton, markItems } from "./mark";
import { useOpenBlock } from "./open-block";
import { KindPicker } from "./pickers";
import { TagPicker } from "./TagPicker";
import type { MinuteRange } from "./timeline-drag";
import { TimeEditor } from "./TimeEditor";
import { zoneTimeLabel } from "./zone-time";

const DELETED_COLOR = "#9aa3ad";
const COLUMN_COUNT = 3;
/** 空档至少多长才写一行（分钟）：短于半小时的多是路上、吃饭的缝 */
const GAP_MINUTES = 30;
/** 点空档加的事默认多长（分钟），空档没这么长就到空档结束 */
const GAP_ADD_MINUTES = 60;

interface BlockTableProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  baseId: string;
  date: string;
  dayLabel: string;
  /** 全计划的开销格摘要，按块 id */
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 筛选；没开是 undefined */
  filter?: StatsFilter;
  /** 这天一行都不剩时把焦点交出去（落到这天的菜单按钮） */
  onEmptyFocus: () => void;
}

/** 焦点最后在哪一行、这一行的哪个位置（读屏名里「：」前面那段，比如「类型：」「这件事的操作」）。 */
interface FocusSpot {
  blockId: string;
  index: number;
  control: string;
}

/** 时刻表里的一行：一件事、事和事之间的空档，或者「没排时间」小标题。 */
type ScheduleRow = { type: "block"; block: BlockView } | { type: "gap"; from: number; to: number } | { type: "undated" };

/**
 * 一天的时刻表：一张三列的表——开始时刻、竖线（线上的圆圈是「划掉」）、一件事一张卡片；
 * 事和事之间空着半小时以上写一行空档（点了在那个钟点加一件事），没排时间的在后面，末尾「加一件事」。
 * 带筛选时只画通过的块，写「筛掉了 N 件」；空档按这天全部的事算（筛掉的事那段时间并不空）。
 * 一行消失（划掉、改类型被筛掉，删除）而焦点掉到页面最外面时，焦点落到下一行的同一个位置，没有下一行就上一行，都没有就交给这天的组头。
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
  const rows = scheduleRows(blocks, freeGaps(plan, baseId, GAP_MINUTES));
  const tbody = useRef<HTMLTableSectionElement>(null);
  const focusSpot = useRef<FocusSpot | null>(null);
  // 这天最近加的那件被筛掉了，「筛掉了 N 件」后面写上它
  const justAdded = useJustAdded(dayBlocks, blocks, filter);
  // 点了哪一行空档：贴着它弹「加一件事」
  const [adding, setAdding] = useState<{ range: MinuteRange; anchor: HTMLElement } | null>(null);

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
  const tags = [...libraryView.tags.values()].sort(byOrder);
  const countKindUsing = (kindId: string) => countBlocksUsing(plan, { kindId });

  return (
    <>
      <table aria-label={`${dayLabel} 的安排`} className="schedule w-full">
        {/* 列宽写死（表格按固定宽度排）：编辑区再宽也只在卡片里换行，不把整张表撑出屏幕 */}
        <colgroup>
          <col className="schedule-col-time" />
          <col className="schedule-col-rail" />
          <col />
        </colgroup>
        <thead className="sr-only">
          <tr>
            <th>开始</th>
            <th>划掉</th>
            <th>这件事</th>
          </tr>
        </thead>
        <tbody ref={tbody} onFocus={rememberFocus}>
          {rows.map((row) => {
            if (row.type === "gap") {
              return (
                <GapRow
                  key={`gap-${row.from}`}
                  from={row.from}
                  to={row.to}
                  onAdd={(anchor) =>
                    setAdding({ range: { from: row.from, to: Math.min(row.to, row.from + GAP_ADD_MINUTES) }, anchor })
                  }
                />
              );
            }
            if (row.type === "undated") {
              return (
                <tr key="undated" data-undated-heading className="schedule-heading">
                  <td />
                  <td className="schedule-rail" />
                  <td>没排时间</td>
                </tr>
              );
            }
            return (
              <BlockRow
                key={row.block.id}
                doc={doc}
                library={library}
                plan={plan}
                block={row.block}
                date={date}
                kinds={kinds}
                tags={tags}
                followerCount={followersOf(plan, libraryView, row.block.id).length}
                countKindUsing={countKindUsing}
                moneyCell={moneyCells.get(row.block.id)}
              />
            );
          })}
          {hiddenCount > 0 && (
            <tr data-filtered-out>
              <td colSpan={COLUMN_COUNT} className="pt-1 text-sm text-ink-muted">
                筛掉了 {hiddenCount} 件
                {justAdded.hidden !== undefined && `，包括刚加的「${justAdded.hidden.title}」`}
              </td>
            </tr>
          )}
          <tr>
            <td colSpan={COLUMN_COUNT} className="pt-1">
              <AddBlock
                doc={doc}
                library={library}
                baseId={baseId}
                kindId={addKindIdFor(filter)}
                tagIds={addTagIdsFor(filter)}
                onAdded={justAdded.remember}
              />
            </td>
          </tr>
        </tbody>
      </table>
      {adding !== null && (
        <AddAtTime
          doc={doc}
          library={library}
          plan={plan}
          filter={filter}
          baseId={baseId}
          label={dayLabel}
          range={adding.range}
          anchor={adding.anchor}
          onClose={() => setAdding(null)}
          // 建出来框关掉，焦点到新那件的标题：接着就能改它
          onAdded={(blockId) => {
            setAdding(null);
            tbody.current?.querySelector<HTMLElement>(`tr[data-block-id="${blockId}"] input[aria-label="标题"]`)?.focus();
          }}
        />
      )}
    </>
  );
}

/**
 * 时刻表的行：排上时间的按开始时刻，空档插在它后面第一件看得见的事前面（后面的都被筛掉了就放在最后一件后面）；
 * 一件排上时间的都看不见时不写空档。没排时间的在后面，前面一行「没排时间」。
 */
function scheduleRows(blocks: BlockView[], gaps: ReadonlyArray<{ from: number; to: number }>): ScheduleRow[] {
  const timed = blocks.filter((block) => block.start_minute !== null);
  const undated = blocks.filter((block) => block.start_minute === null);
  const rows: ScheduleRow[] = [];
  let next = 0;
  for (const block of timed) {
    while (next < gaps.length && gaps[next]!.to <= block.start_minute!) rows.push({ type: "gap", ...gaps[next++]! });
    rows.push({ type: "block", block });
  }
  if (timed.length > 0) while (next < gaps.length) rows.push({ type: "gap", ...gaps[next++]! });
  if (undated.length > 0) rows.push({ type: "undated" }, ...undated.map((block) => ({ type: "block" as const, block })));
  return rows;
}

/** 一行空档：开始时刻，线接着往下画，「空 1.5 小时 · 在 11:00 加一件事」，点了贴着它弹「加一件事」。 */
function GapRow({ from, to, onAdd }: { from: number; to: number; onAdd: (anchor: HTMLElement) => void }) {
  return (
    <tr data-gap className="schedule-gap-row">
      <td className="schedule-time">{clock(from)}</td>
      <td className="schedule-rail" />
      <td>
        <button type="button" className="schedule-gap" onClick={(event) => onAdd(event.currentTarget)}>
          {`空 ${durationLabel(to - from)} · 在 ${clock(from)} 加一件事`}
        </button>
      </td>
    </tr>
  );
}

interface BlockRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  block: BlockView;
  date: string;
  kinds: KindView[];
  /** 资料库里全部标签，按顺序 */
  tags: TagView[];
  /** 删除时会被一起带走的块数 */
  followerCount: number;
  countKindUsing: (kindId: string) => number;
  /** 这块的开销格摘要；一笔开销都没挂就是 undefined */
  moneyCell: MoneyCell | undefined;
}

function BlockRow({
  doc,
  library,
  plan,
  block,
  date,
  kinds,
  tags,
  followerCount,
  countKindUsing,
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
  const duration = undated ? 0 : (block.duration_min ?? 0);

  // 删除不再确认，靠撤销：删完在屏幕底部说删了什么、能撤销；套着块时写明会一起删几个
  const deleteItem: MenuItem = {
    label: deleteLabel(followerCount),
    danger: true,
    onSelect: () => notifyDeleted(deleteBlockWithNotice(doc, library, block, followerCount)),
  };
  // 「详情…」打开详情气泡（时间线上点开的也是它），贴着这一行的「这件事的操作」弹出
  const detailsItem: MenuItem = {
    label: "详情…",
    onSelect: () => openBlock(block.id, row.current!.querySelector<HTMLElement>("button[aria-label='这件事的操作']")!),
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
  // 收起开销的编辑区后焦点回到开销格；先挪焦点，空行里填了没回车的借这次离开建上（按 Esc 的在空行里就放弃了）
  const closeMoney = () => {
    row.current?.querySelector<HTMLElement>("button[aria-label='开销']")?.focus();
    setMoneyOpen(false);
  };
  const subtitleLine = [block.subtitle, block.note === null ? null : "有长备注"].filter((part) => part !== null).join(" · ");
  const moneyNote = moneyCellNote(moneyCell);
  const items: MenuItem[] = undated
    ? [...undatedArrangeItems(doc, plan, block), ...markItems(doc, block), detailsItem, deleteItem]
    : [...markItems(doc, block), detailsItem, deleteItem];

  return (
    <>
      <tr
        ref={row}
        data-block-id={block.id}
        data-mark={block.mark}
        className="schedule-row"
        style={{ "--kind-color": color, "--indent": indent } as CSSProperties}
      >
        <td className="schedule-time">{undated ? "" : clock(block.start_minute!)}</td>
        {/* 竖线上的圆圈就是标记（照滴答的日程：线上的圈能打勾）：点一下换下一档 */}
        <td className="schedule-rail">
          <MarkButton doc={doc} block={block} className="schedule-check" />
        </td>
        <td>
          <div className="schedule-card" data-indent={indent}>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="时间"
                aria-expanded={timeOpen}
                className="input-bare w-auto text-left text-sm whitespace-nowrap text-sage-deep"
                onClick={() => setTimeOpen((value) => !value)}
              >
                <span data-block-time className="tabular-nums">
                  {zoneTimeLabel(plan, block) ?? blockTimeLabel(block, date)}
                </span>
              </button>
              {duration > 0 && (
                <span data-block-duration className="text-xs whitespace-nowrap text-ink-muted">
                  {`· ${durationLabel(duration)}`}
                </span>
              )}
              <span className="flex-1" />
              <Menu label="这件事的操作" items={items}>
                ⋯
              </Menu>
            </div>
            <CommitInput
              label="标题"
              showLabel={false}
              value={block.title}
              className="input-bare schedule-title"
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
            <div className="flex flex-wrap items-center gap-x-1 gap-y-0.5">
              <KindPicker doc={doc} library={library} block={block} kinds={kinds} countUsing={countKindUsing} />
              <TagPicker doc={doc} library={library} block={block} tags={tags} />
              {/* 没开销可显示时淡色的「填开销」：空格子本身就是还没填的进度；按类型筛时，别的类型的开销在下面另写一行 */}
              <button
                type="button"
                aria-label="开销"
                aria-expanded={moneyOpen}
                className={`input-bare w-auto text-left text-sm whitespace-nowrap tabular-nums ${moneyCellEmpty(moneyCell) ? "text-ink-muted/60" : "text-ink"}`}
                onClick={() => setMoneyOpen((value) => !value)}
              >
                <span data-money-cell>{moneyCellLabel(moneyCell)}</span>
                {moneyNote !== null && (
                  <span data-money-note className="block text-xs text-ink-muted">
                    {moneyNote}
                  </span>
                )}
              </button>
            </div>
          </div>
        </td>
      </tr>
      {timeOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="schedule-editor">
            <TimeEditor doc={doc} library={library} plan={plan} block={block} onDone={closeTime} />
          </td>
        </tr>
      )}
      {moneyOpen && (
        <tr>
          <td colSpan={COLUMN_COUNT} className="schedule-editor">
            <MoneyEditor
              doc={doc}
              library={library}
              plan={plan}
              kinds={kinds}
              countKindUsing={countKindUsing}
              block={block}
              label={`${block.title} 的开销`}
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

/** 读屏名里「：」前面那段当位置：「类型：游玩」「类型：餐饮」是同一个位置。 */
function controlKey(label: string): string {
  const colon = label.indexOf("：");
  return colon === -1 ? label : label.slice(0, colon + 1);
}

function controlSelector(control: string): string {
  return control.endsWith("：") ? `[aria-label^="${control}"]` : `[aria-label="${control}"]`;
}
