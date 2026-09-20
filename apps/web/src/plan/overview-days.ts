import {
  busyMinutes,
  dayFacts,
  expensePasses,
  expenseTotalCents,
  fillProgress,
  moneySummary,
  passesFilter,
  unscheduledMinutes,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { clockOnDay, durationLabel } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { dayMoney, distanceLabel } from "./day-facts";
import { formatYuan } from "./money";
import { moneyOnHiddenBlocks, type MoneyCell } from "./money-cells";

/** 「每天」卡片里的一行：写出来的字，没有的项是 null。 */
export interface OverviewRow {
  /** 是某一天就是它的底座 id，点日期跳过去；最后几行是 null */
  baseId: string | null;
  label: string;
  isToday: boolean;
  /** 「09:00–16:00」 */
  span: string | null;
  /** 排了多久「5.5 小时」 */
  busy: string | null;
  /** 「2 小时 130 公里」 */
  drive: string | null;
  /** 还没排「1.5 小时」 */
  unscheduled: string | null;
  /** 花多少「¥300」；一笔都没填是 null */
  money: string | null;
  /** 「1 笔没填」 */
  unfilled: string | null;
  /** 「5 件」「1 件 · 划掉 1」 */
  blocks: string | null;
  /** 细条多长（0–1，花得最多的那天是 1）；这天没填金额、或者最后几行不画，是 null */
  share: number | null;
  /** 手机上第二行的各项，写法同「这天怎么样」 */
  line: string[];
}

export interface OverviewDays {
  days: OverviewRow[];
  /** 「不属于任何一天」「挂在被筛掉的事上」：有才有 */
  extra: OverviewRow[];
  total: OverviewRow;
}

interface Counts {
  busyMinutes: number;
  driveMinutes: number;
  driveDistanceM: number;
  unscheduledMinutes: number;
  unfilled: number;
  blocks: number;
  struck: number;
}

/**
 * 总览「每天」卡片的各行：每天一行并排比，最后是不属于任何一天、挂在被筛掉的事上、合计。
 * 每天的几项和日程组头的「这天怎么样」同一套算法；花那一列加起来是开销总览的总额。只摆数，不判断。
 */
export function overviewDays(
  plan: PlanView,
  cells: ReadonlyMap<string, MoneyCell>,
  labels: readonly string[],
  today: string,
  filter?: StatsFilter,
): OverviewDays {
  const sum: Counts = {
    busyMinutes: 0,
    driveMinutes: 0,
    driveDistanceM: 0,
    unscheduledMinutes: 0,
    unfilled: 0,
    blocks: 0,
    struck: 0,
  };
  const spent = plan.bases.map((base) => dayMoney(plan, base.id, cells));
  const most = Math.max(0, ...spent.map((money) => money.cents));

  const days = plan.bases.map((base, index): OverviewRow => {
    const facts = dayFacts(plan, base.id, filter);
    const shown = blocksOfDay(plan, base.id).filter((block) => passesFilter(block, filter));
    const counts: Counts = {
      busyMinutes: busyMinutes(plan, base.id, filter),
      driveMinutes: facts.driveMinutes,
      driveDistanceM: facts.driveDistanceM,
      unscheduledMinutes: unscheduledMinutes(plan, base.id, filter),
      unfilled: spent[index]!.unfilled,
      blocks: shown.length,
      struck: shown.filter((block) => block.mark === "struck").length,
    };
    add(sum, counts);
    const start = facts.firstStartMinute === null ? null : clockOnDay(facts.firstStartMinute, base.date);
    const end = facts.lastEndMinute === null ? null : clockOnDay(facts.lastEndMinute, base.date);
    const money = spent[index]!;
    return {
      ...countCells(counts),
      baseId: base.id,
      label: labels[index]!,
      isToday: base.date === today,
      span: start === null ? null : `${start}–${end}`,
      money: money.count > money.unfilled ? formatYuan(money.cents) : null,
      // 这天一笔填了金额的都没有就不画：空的一道像分隔线
      share: most > 0 && money.count > money.unfilled ? money.cents / most : null,
      line: [...(start === null ? [] : [`${start} 起`, `${end} 收工`]), ...countLine(counts)],
    };
  });

  const extra: OverviewRow[] = [];
  const unattributed = unattributedMoney(plan, filter);
  if (unattributed.count > 0) {
    sum.unfilled += unattributed.unfilled;
    extra.push(moneyRow("不属于任何一天", unattributed));
  }
  const hidden = moneyOnHiddenBlocks(plan, filter);
  if (hidden > 0) extra.push(moneyRow("挂在被筛掉的事上", { cents: hidden, count: 1, unfilled: 0 }));

  const anyFilled = fillProgress(plan, filter).filledCount > 0;
  const total: OverviewRow = {
    ...countCells(sum),
    baseId: null,
    label: "合计",
    isToday: false,
    span: null,
    money: anyFilled ? formatYuan(moneySummary(plan, filter).totalCents) : null,
    share: null,
    line: countLine(sum),
  };
  return { days, extra, total };
}

function add(sum: Counts, counts: Counts): void {
  for (const key of Object.keys(sum) as Array<keyof Counts>) sum[key] += counts[key];
}

/** 排了、自驾、还没排、几笔没填、几件：表里各一格。 */
function countCells(counts: Counts): Pick<OverviewRow, "busy" | "drive" | "unscheduled" | "unfilled" | "blocks"> {
  return {
    busy: counts.busyMinutes > 0 ? durationLabel(counts.busyMinutes) : null,
    drive: driveLabel(counts),
    unscheduled: counts.unscheduledMinutes > 0 ? durationLabel(counts.unscheduledMinutes) : null,
    unfilled: counts.unfilled > 0 ? `${counts.unfilled} 笔没填` : null,
    blocks:
      counts.blocks === 0 ? null : `${counts.blocks} 件${counts.struck > 0 ? ` · 划掉 ${counts.struck}` : ""}`,
  };
}

/** 同上几项写成手机上第二行的样子（「排了 5.5 小时」「还有 1.5 小时没排」）。 */
function countLine(counts: Counts): string[] {
  const { busy, drive, unscheduled, unfilled, blocks } = countCells(counts);
  return [
    ...(busy === null ? [] : [`排了 ${busy}`]),
    ...(drive === null ? [] : [`自驾 ${drive}`]),
    ...(unscheduled === null ? [] : [`还有 ${unscheduled}没排`]),
    ...(unfilled === null ? [] : [unfilled]),
    ...(blocks === null ? [] : [blocks]),
  ];
}

/** 「2 小时 130 公里」，同「这天怎么样」里自驾那一项。 */
function driveLabel(counts: Counts): string | null {
  const parts = [
    ...(counts.driveMinutes > 0 ? [durationLabel(counts.driveMinutes)] : []),
    ...(counts.driveDistanceM > 0 ? [distanceLabel(counts.driveDistanceM)] : []),
  ];
  return parts.length > 0 ? parts.join(" ") : null;
}

/** 一个块都不挂、通过筛选的开销：填了的合计、几笔、几笔没填。 */
function unattributedMoney(plan: PlanView, filter?: StatsFilter): { cents: number; count: number; unfilled: number } {
  const money = { cents: 0, count: 0, unfilled: 0 };
  for (const expense of plan.expenses.values()) {
    if (expense.block_ids.length > 0 || !expensePasses(expense, plan, filter)) continue;
    money.count += 1;
    const cents = expenseTotalCents(expense, plan.plan.traveler_count);
    if (cents === null) money.unfilled += 1;
    else money.cents += cents;
  }
  return money;
}

/** 只有花多少的一行（不属于任何一天、挂在被筛掉的事上）。 */
function moneyRow(label: string, money: { cents: number; count: number; unfilled: number }): OverviewRow {
  const unfilled = money.unfilled > 0 ? `${money.unfilled} 笔没填` : null;
  return {
    baseId: null,
    label,
    isToday: false,
    span: null,
    busy: null,
    drive: null,
    unscheduled: null,
    money: money.count > money.unfilled ? formatYuan(money.cents) : null,
    unfilled,
    blocks: null,
    share: null,
    line: unfilled === null ? [] : [unfilled],
  };
}
