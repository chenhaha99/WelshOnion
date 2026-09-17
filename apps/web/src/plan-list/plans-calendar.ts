import { addDays } from "../plan/block-time";

/** 月历要用的计划索引字段 */
export interface CalendarPlan {
  plan_id: string;
  name: string;
  date_start: string | null;
  date_end: string | null;
  day_count: number;
  traveler_count: number;
}

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** 是不是这个月的（不是的画淡一些） */
  inMonth: boolean;
}

/** 一个计划在一周里的那一段 */
export interface CalendarSegment {
  plan: CalendarPlan;
  /** 从第几列到第几列，1 是周一、7 是周日 */
  fromColumn: number;
  toColumn: number;
  /** 这一周里的第几道，从 1 数 */
  lane: number;
  /** 这周之前就开始了：左边画平 */
  continuesBefore: boolean;
  /** 这周之后还有：右边画平 */
  continuesAfter: boolean;
}

export interface CalendarWeek {
  /** 周一到周日 */
  days: CalendarDay[];
  /** 按出发日期从早到晚（一样早的按计划 id）排，就是摆放的顺序 */
  segments: CalendarSegment[];
  /** 这一周用了几道，至少 1 */
  laneCount: number;
}

export interface MonthLayout {
  /** 和这个月沾边的几周 */
  weeks: CalendarWeek[];
  /** 还没排日期的计划，照给的顺序 */
  undated: CalendarPlan[];
}

/**
 * 计划列表页的月历怎么摆：month 是「YYYY-MM」。一周从周一开始，只摆和这个月沾边的几周；
 * 每个排了日期的计划按周折成几段，同一周里重叠的分道（道按周分，不跨周对齐）。
 */
export function monthLayout(month: string, plans: readonly CalendarPlan[]): MonthLayout {
  const first = `${month}-01`;
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1);
  const weekStart = addDays(first, -mondayIndex(first));
  const weekEnd = addDays(last, 6 - mondayIndex(last));

  const dated = plans
    .filter((plan): plan is CalendarPlan & { date_start: string; date_end: string } => plan.date_start !== null)
    .sort((a, b) => compare(a.date_start, b.date_start) || compare(a.plan_id, b.plan_id));

  const weeks: CalendarWeek[] = [];
  for (let start = weekStart; start <= weekEnd; start = addDays(start, 7)) {
    const end = addDays(start, 6);
    const days = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      return { date, inMonth: date.slice(0, 7) === month };
    });
    const segments: CalendarSegment[] = [];
    for (const plan of dated) {
      if (plan.date_start > end || plan.date_end < start) continue;
      const fromColumn = mondayIndex(plan.date_start < start ? start : plan.date_start) + 1;
      const toColumn = mondayIndex(plan.date_end > end ? end : plan.date_end) + 1;
      let lane = 1;
      while (segments.some((other) => other.lane === lane && other.fromColumn <= toColumn && fromColumn <= other.toColumn)) {
        lane += 1;
      }
      segments.push({
        plan,
        fromColumn,
        toColumn,
        lane,
        continuesBefore: plan.date_start < start,
        continuesAfter: plan.date_end > end,
      });
    }
    weeks.push({ days, segments, laneCount: Math.max(1, ...segments.map((segment) => segment.lane)) });
  }

  return { weeks, undated: plans.filter((plan) => plan.date_start === null) };
}

/** 「YYYY-MM」往后（delta 为负是往前）翻几个月。 */
export function shiftMonth(month: string, delta: number): string {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** 周一是 0、周日是 6。 */
function mondayIndex(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
