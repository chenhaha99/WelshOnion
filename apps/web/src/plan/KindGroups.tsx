import {
  countBlocksUsing,
  expensePasses,
  expenseTotalCents,
  passesFilter,
  type BlockView,
  type ExpenseView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { useLayoutEffect, useRef, type FocusEvent } from "react";
import type * as Y from "yjs";
import { blocksOfDay } from "./day-blocks";
import { dateWithWeekday } from "./day-labels";
import { formatYuan } from "./money";
import { DraftRow, ExpenseRow } from "./MoneyEditor";

/** 被删掉的类型合成一组，灰色，排在最后 */
const DELETED_GROUP = "deleted";
const DELETED_COLOR = "#9aa3ad";

type Row =
  | { type: "expense"; id: string; order: number; expense: ExpenseView }
  | { type: "empty"; id: string; order: number; block: BlockView };

interface Group {
  key: string;
  name: string;
  color: string;
  order: number;
  rows: Row[];
}

interface FocusSpot {
  rowId: string;
  index: number;
  control: string;
}

interface KindGroupsProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  filter: StatsFilter | undefined;
  /** 一行都不剩时焦点落到这里（「分组」里按下的按钮） */
  onEmptyFocus: () => void;
}

/**
 * 按类型分组：一类一组，这一类通过筛选的钱一笔一行（写挂在哪些块上），这一类一笔钱都没挂的块一行空的、填了就建，
 * 每组末尾加一笔；下面一行加别的类型的钱。行按行程的先后排，不挂块的钱在最后。
 * 行变了、焦点掉到页面最外面时，落回同一行，那一行不在了就落到原来位置的下一行。
 */
export function KindGroups({ doc, library, libraryView, plan, filter, onEmptyFocus }: KindGroupsProps) {
  const kinds = [...libraryView.kinds.values()].sort((a, b) => a.order - b.order);
  const countKindUsing = (kindId: string) => countBlocksUsing(plan, { kindId });
  const tripOrder = tripOrderOf(plan);
  const blockLabel = blockLabeller(plan);
  const groups = kindGroups(plan, libraryView, filter, tripOrder);
  // 加钱时「挂到」只列通过筛选的块，按行程的先后：加完看得见
  const blockChoices = [...tripOrder.keys()]
    .map((blockId) => plan.blocks.get(blockId)!)
    .filter((block) => passesFilter(block, filter))
    .map((block) => ({ id: block.id, label: blockLabel(block) }));
  // 「加一笔别的类型的钱」：按了按类型筛时只能选按下的那几类，同样是为了加完看得见
  const kindIds = filter?.kindIds;
  const otherKindChoices = kindIds ? kinds.filter((kind) => kindIds.includes(kind.id)) : kinds;
  const otherDefaultKind = otherKindChoices.some((kind) => kind.id === "other")
    ? "other"
    : (otherKindChoices[0]?.id ?? "other");

  const list = useRef<HTMLOListElement>(null);
  const focusSpot = useRef<FocusSpot | null>(null);
  const rowIds = groups.flatMap((group) => group.rows.map((row) => row.id));

  // 弹出去的选择器不在列表里：焦点在那里时不改记录，记的还是打开它的那个按钮
  const rememberFocus = (event: FocusEvent<HTMLOListElement>) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>("[data-row-id]");
    if (!row || !event.currentTarget.contains(row)) return;
    const rowId = row.dataset.rowId!;
    focusSpot.current = { rowId, index: rowIds.indexOf(rowId), control: controlKey(target) };
  };

  const rowKey = rowIds.join(",");
  useLayoutEffect(() => {
    const spot = focusSpot.current;
    if (!spot || (document.activeElement !== null && document.activeElement !== document.body)) return;
    focusSpot.current = null;
    const targetId = rowIds.includes(spot.rowId) ? spot.rowId : rowIds[Math.min(spot.index, rowIds.length - 1)];
    if (targetId === undefined) {
      onEmptyFocus();
      return;
    }
    const row = list.current?.querySelector<HTMLElement>(`[data-row-id="${targetId}"]`);
    if (row) findControl(row, spot.control)?.focus();
    // 只在显示的行变了时看一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  return (
    <>
      <ol ref={list} aria-label="类型分组" className="flex flex-col gap-3" onFocus={rememberFocus}>
        {groups.map((group) => (
          <li key={group.key} aria-label={group.name} className="glass-card flex flex-col gap-2 px-5 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="flex items-center gap-1.5 text-base text-ink">
                <span aria-hidden="true" className="kind-dot" style={{ backgroundColor: group.color }} />
                {group.name}
              </h3>
              <span data-group-summary className="text-sm text-ink-muted tabular-nums">
                {summaryOf(group, plan)}
              </span>
            </div>
            {group.rows.map((row) =>
              row.type === "expense" ? (
                <div key={row.id} data-row-id={row.id}>
                  <ExpenseRow
                    doc={doc}
                    library={library}
                    expense={row.expense}
                    kinds={kinds}
                    countKindUsing={countKindUsing}
                    blockId={null}
                    blocksLabel={attachedLabel(row.expense, plan, tripOrder, blockLabel)}
                  />
                </div>
              ) : (
                <div key={row.id} data-row-id={row.id} data-empty-block-id={row.id}>
                  <DraftRow
                    doc={doc}
                    library={library}
                    blockId={row.id}
                    // 块的类型被删了时，新一笔先记成「其他」（同按天时）
                    defaultKindId={libraryView.kinds.has(row.block.kind.id) ? row.block.kind.id : "other"}
                    autoFocus={false}
                    lead={<span data-block-label>{blockLabel(row.block)}</span>}
                  />
                </div>
              ),
            )}
            {/* 被删掉的类型那一组不加：新钱不该记成已删除的类型 */}
            {group.key !== DELETED_GROUP && (
              <div data-add-row>
                <DraftRow
                  doc={doc}
                  library={library}
                  blockId={null}
                  defaultKindId={group.key}
                  autoFocus={false}
                  blockChoices={blockChoices}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      {/* 每组末尾只能加这个计划已经用到的类型；第一笔新类型的钱从这里加 */}
      <section aria-label="加一笔别的类型的钱" className="glass-card flex flex-col gap-2 px-5 py-3">
        <DraftRow
          doc={doc}
          library={library}
          blockId={null}
          defaultKindId={otherDefaultKind}
          autoFocus={false}
          lead="加一笔别的类型"
          kindChoices={otherKindChoices}
          blockChoices={blockChoices}
        />
      </section>
    </>
  );
}

/** 整个行程里块的先后：按天的顺序，把每天安排表的顺序接起来。 */
function tripOrderOf(plan: PlanView): Map<string, number> {
  const order = new Map<string, number>();
  for (const base of plan.bases) {
    for (const block of blocksOfDay(plan, base.id)) order.set(block.id, order.size);
  }
  return order;
}

/** 「10.1 周四 民宿」：块开始那天加标题。 */
function blockLabeller(plan: PlanView): (block: BlockView) => string {
  const dates = new Map(plan.bases.map((base) => [base.id, base.date]));
  return (block) => `${dateWithWeekday(dates.get(block.start_base_id)!)} ${block.title}`;
}

function kindGroups(
  plan: PlanView,
  libraryView: LibraryView,
  filter: StatsFilter | undefined,
  tripOrder: ReadonlyMap<string, number>,
): Group[] {
  const groups = new Map<string, Group>();
  const groupOf = (kindId: string): Group => {
    const known = libraryView.kinds.get(kindId);
    const key = known ? kindId : DELETED_GROUP;
    let group = groups.get(key);
    if (!group) {
      group = known
        ? { key, name: known.name, color: known.color, order: known.order, rows: [] }
        : { key, name: "已删除的类型", color: DELETED_COLOR, order: Number.POSITIVE_INFINITY, rows: [] };
      groups.set(key, group);
    }
    return group;
  };
  const place = (blockId: string) => tripOrder.get(blockId) ?? Number.POSITIVE_INFINITY;

  // 挂了钱的块（挂了没填金额的钱也算），不管那笔钱过不过筛选
  const withMoney = new Set<string>();
  for (const expense of plan.expenses.values()) {
    for (const blockId of expense.block_ids) withMoney.add(blockId);
    if (!expensePasses(expense, plan, filter)) continue;
    const order = Math.min(Number.POSITIVE_INFINITY, ...expense.block_ids.map(place));
    groupOf(expense.kind.id).rows.push({ type: "expense", id: expense.id, order, expense });
  }
  for (const block of plan.blocks.values()) {
    if (withMoney.has(block.id) || !passesFilter(block, filter)) continue;
    groupOf(block.kind.id).rows.push({ type: "empty", id: block.id, order: place(block.id), block });
  }

  for (const group of groups.values()) {
    // 不挂块的钱位置是无穷大：两个无穷大相减是 NaN，按 id 排（id 带着创建时间）
    group.rows.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }
  return [...groups.values()].sort((a, b) => a.order - b.order);
}

/** 组头：「¥800 · 3 笔」「¥480 · 2 笔 · 还有 1 笔没填」；只有空行时「还没有钱」。 */
function summaryOf(group: Group, plan: PlanView): string {
  const money = group.rows.flatMap((row) => (row.type === "expense" ? [row.expense] : []));
  if (money.length === 0) return "还没有钱";
  let cents = 0;
  let unfilled = 0;
  for (const expense of money) {
    const total = expenseTotalCents(expense, plan.plan.traveler_count);
    if (total === null) unfilled += 1;
    else cents += total;
  }
  return [`${formatYuan(cents)} · ${money.length} 笔`, ...(unfilled > 0 ? [`还有 ${unfilled} 笔没填`] : [])].join(" · ");
}

/** 「挂在 10.1 周四 民宿、10.2 周五 民宿」，按行程的先后；一块都不挂写「不挂块」。 */
function attachedLabel(
  expense: ExpenseView,
  plan: PlanView,
  tripOrder: ReadonlyMap<string, number>,
  blockLabel: (block: BlockView) => string,
): string {
  const blocks = expense.block_ids
    .flatMap((blockId) => {
      const block = plan.blocks.get(blockId);
      return block ? [block] : [];
    })
    .sort((a, b) => (tripOrder.get(a.id) ?? 0) - (tripOrder.get(b.id) ?? 0));
  return blocks.length === 0 ? "不挂块" : `挂在 ${blocks.map(blockLabel).join("、")}`;
}

/** 一个控件是哪一个：读屏名（没有就用按钮上的字），冒号后面跟着的当前值不算。 */
function controlKey(element: HTMLElement): string {
  const label = element.getAttribute("aria-label") ?? element.textContent?.trim() ?? "";
  const colon = label.indexOf("：");
  return colon === -1 ? label : label.slice(0, colon + 1);
}

/** 这一行里同一个控件；没有就是第一个能点、能填的地方。 */
function findControl(row: HTMLElement, control: string): HTMLElement | null {
  const controls = [...row.querySelectorAll<HTMLElement>("button, input, select, textarea")];
  return controls.find((element) => controlKey(element) === control) ?? controls[0] ?? null;
}
