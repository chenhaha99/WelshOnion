import type { RowLayout } from "./timeline-layout";

/** 这天主轨上没有排上时间的事时，框滚到几点（分钟） */
const DEFAULT_SCROLL_MINUTE = 8 * 60;
/** 看今天时，从现在往前留多少分钟 */
const TODAY_LEAD_MIN = 60;
/** 不是今天时，从最早的事往前留多少分钟 */
const FIRST_EVENT_LEAD_MIN = 30;

/**
 * 窄屏上打开计划页时落在第几行（底座已按日期排好）：
 * 今天在首尾之间，就是日期是今天的第一行，那一天删了就是之后最近的一行；早于第一天是第一行，晚于最后一天是最后一行。
 */
export function initialDayIndex(bases: ReadonlyArray<{ date: string }>, today: string): number {
  // 日期是「YYYY-MM-DD」，按字符串比就是按日期比
  const index = bases.findIndex((base) => base.date >= today);
  return index === -1 ? bases.length - 1 : index;
}

/**
 * 打开或翻到这一天时，竖排的框滚到最上面是这天第几分钟：
 * 看今天是现在往前 1 小时；否则是主轨上最早开始的事往前 30 分钟，主轨上没事就是 08:00；都不早于 0 点。
 * 背景条（停留、住宿）不算：停留从 0 点开始，算上的话每天都滚到 0 点。
 */
export function scrollMinute(row: RowLayout, isToday: boolean, nowMinute: number): number {
  if (isToday) return Math.max(0, nowMinute - TODAY_LEAD_MIN);
  if (row.main.length === 0) return DEFAULT_SCROLL_MINUTE;
  return Math.max(0, Math.min(...row.main.map((item) => item.from)) - FIRST_EVENT_LEAD_MIN);
}
