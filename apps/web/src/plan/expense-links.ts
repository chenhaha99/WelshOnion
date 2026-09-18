import type { BlockView, ExpenseView, PlanView } from "@welshonion/core";
import { blocksOfDay } from "./day-blocks";
import { dateWithWeekday } from "./day-labels";
import { formatYuan } from "./money";

/** 整个行程里块的先后：按天的顺序，把每天时刻表的顺序接起来。 */
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

/** 「挂在 10.1 周四 民宿、10.2 周五 民宿」，按行程的先后；一块都不挂写「不属于任何一天」。 */
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
  return blocks.length === 0 ? "不属于任何一天" : `挂在 ${blocks.map(blockLabel).join("、")}`;
}

/**
 * 「挂上已有的一笔」的选项：计划里还没挂在这块上的开销（不管筛选）。按它最早那块在行程里的先后，
 * 不属于任何一天的在最后、之间按 id（id 带着创建时间）。每项写「住宿 ¥800 民宿两晚 · 挂在 10.1 周四 民宿」。
 */
export function linkableExpenses(plan: PlanView, blockId: string): Array<{ id: string; label: string }> {
  const tripOrder = tripOrderOf(plan);
  const blockLabel = blockLabeller(plan);
  const place = (expense: ExpenseView) =>
    Math.min(Number.POSITIVE_INFINITY, ...expense.block_ids.map((id) => tripOrder.get(id) ?? Number.POSITIVE_INFINITY));
  return (
    [...plan.expenses.values()]
      .filter((expense) => !expense.block_ids.includes(blockId))
      .map((expense) => ({ expense, order: place(expense) }))
      // 两个无穷大相减是 NaN，按 id 排
      .sort((a, b) => a.order - b.order || (a.expense.id < b.expense.id ? -1 : a.expense.id > b.expense.id ? 1 : 0))
      .map(({ expense }) => ({
        id: expense.id,
        label: `${expenseText(expense)} · ${attachedLabel(expense, plan, tripOrder, blockLabel)}`,
      }))
  );
}

/** 「住宿 ¥800 民宿两晚」「餐饮 人均 ¥80」「其他 未填 保险」：金额是填的数，人均不乘人数。 */
function expenseText(expense: ExpenseView): string {
  const kind = expense.kind.deleted ? "已删除的类型" : expense.kind.name;
  const amount =
    expense.amount_cents === null
      ? "未填"
      : `${expense.basis === "per_person" ? "人均 " : ""}${formatYuan(expense.amount_cents)}`;
  return [kind, amount, expense.title].filter((part) => part !== "").join(" ");
}
