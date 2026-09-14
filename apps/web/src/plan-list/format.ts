export interface PlanSummaryFields {
  date_start: string | null;
  date_end: string | null;
  day_count: number;
  traveler_count: number;
}

/**
 * 卡片上的「9.24 – 10.2 · 9 天 · 3 人」。
 * 开始日期不在今年，前面加年份；结束日期和开始不同年，结束日期前加年份；只有一天只写一个日期。
 */
export function planSummaryLine(plan: PlanSummaryFields, currentYear: number): string {
  const people = `${plan.traveler_count} 人`;
  if (plan.date_start === null || plan.date_end === null) return `还没排日期 · ${people}`;

  const startYear = yearOf(plan.date_start);
  const start = formatDate(plan.date_start, startYear !== currentYear);
  const range =
    plan.date_start === plan.date_end
      ? start
      : `${start} – ${formatDate(plan.date_end, yearOf(plan.date_end) !== startYear)}`;
  return `${range} · ${plan.day_count} 天 · ${people}`;
}

function yearOf(date: string): number {
  return Number(date.slice(0, 4));
}

/** 「YYYY-MM-DD」写成「M.D」，需要时前面加「YYYY.」。 */
function formatDate(date: string, withYear: boolean): string {
  const monthDay = `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
  return withYear ? `${yearOf(date)}.${monthDay}` : monthDay;
}
