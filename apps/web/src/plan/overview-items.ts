import {
  expensePasses,
  expenseTotalCents,
  occupiedMinutes,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { clockOnDay, durationLabel, monthDay } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { formatYuan } from "./money";

/** 点开一类后列的一条：写什么字、点了跳到哪件事（跳不了是 null）。 */
export interface OverviewItem {
  key: string;
  label: string;
  blockId: string | null;
}

/** 整个计划里块的先后：按天的顺序，把每天时刻表的顺序接起来。 */
function planOrder(plan: PlanView): Map<string, number> {
  const order = new Map<string, number>();
  for (const base of plan.bases) {
    for (const block of blocksOfDay(plan, base.id)) order.set(block.id, order.size);
  }
  return order;
}

function dayOf(plan: PlanView, baseId: string): string {
  return monthDay(plan.bases.find((base) => base.id === baseId)?.date ?? "");
}

/**
 * 点开开销里的一类后列的每一笔：「房费 ¥480 · 10.1 民宿」。
 * 挂了几块写「挂在 2 件事上」，一块不挂写「不属于任何一天」；没填金额写「没填」；说明空着写「没写说明」。
 * 按它最早那块在计划里的先后排，不属于任何一天的在最后。
 */
export function moneyItemsOfKind(plan: PlanView, kindId: string, filter?: StatsFilter): OverviewItem[] {
  const order = planOrder(plan);
  const rows = [...plan.expenses.values()]
    .filter((expense) => expense.kind.id === kindId && expensePasses(expense, plan, filter))
    .map((expense) => {
      const blocks = expense.block_ids
        .flatMap((blockId) => {
          const block = plan.blocks.get(blockId);
          return block ? [block] : [];
        })
        .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      const cents = expenseTotalCents(expense, plan.plan.traveler_count);
      const where =
        blocks.length === 0
          ? "不属于任何一天"
          : blocks.length === 1
            ? `${dayOf(plan, blocks[0]!.start_base_id)} ${blocks[0]!.title}`
            : `挂在 ${blocks.length} 件事上`;
      return {
        key: expense.id,
        label: `${expense.title === "" ? "没写说明" : expense.title} ${cents === null ? "没填" : formatYuan(cents)} · ${where}`,
        blockId: blocks[0]?.id ?? null,
        rank: blocks.length === 0 ? Number.POSITIVE_INFINITY : (order.get(blocks[0]!.id) ?? 0),
      };
    })
    .sort((a, b) => a.rank - b.rank || a.key.localeCompare(b.key));
  return rows.map(({ key, label, blockId }) => ({ key, label, blockId }));
}

/**
 * 点开时间里的一类后列的每一件事：「西湖 10.1 09:00 · 3 小时」，按时间先后。
 * 写的是这件事实际占到的时长（套在里面的那件把外面的盖住了，外面的就少算），和环上的数对得起来；
 * 一分钟都没占到的（整个被盖住）不列。
 */
export function timeItemsOfKind(
  plan: PlanView,
  library: LibraryView,
  kindId: string,
  filter?: StatsFilter,
): OverviewItem[] {
  const order = planOrder(plan);
  const occupied = occupiedMinutes(plan, library, filter);
  return [...occupied]
    .flatMap(([blockId, minutes]) => {
      const block = plan.blocks.get(blockId);
      if (!block || minutes === 0 || block.kind.id !== kindId) return [];
      if (block.start_minute === null) return [];
      const day = dayOf(plan, block.start_base_id);
      const date = plan.bases.find((base) => base.id === block.start_base_id)!.date;
      return [
        {
          key: blockId,
          label: `${block.title} ${day} ${clockOnDay(block.start_minute, date)} · ${durationLabel(minutes)}`,
          blockId,
          rank: order.get(blockId) ?? 0,
        },
      ];
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ key, label, blockId }) => ({ key, label, blockId }));
}
