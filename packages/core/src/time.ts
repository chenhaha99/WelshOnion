import type { BaseView, BlockView } from "./read";

const MS_PER_MINUTE = 60_000;

export interface Interval {
  /** 绝对时刻，毫秒 */
  start: number;
  end: number;
}

/**
 * 算过的「日期 + 时区」记住结果：结果只看这两样，一个计划只有几十种。
 * 不记的话大计划一个画面要换算几万次，每次都新建一个浏览器的时区换算器（几十微秒），切到日程要一秒多。
 */
const baseStarts = new Map<string, number>();

/**
 * 底座这一天 00:00（按底座自己的时区）对应的绝对时刻，毫秒。
 * 只换算一次时区偏移：夏令时换时的那一天会差 1 小时。
 */
export function baseStartUtcMs(date: string, tz: string): number {
  const key = `${date} ${tz}`;
  const known = baseStarts.get(key);
  if (known !== undefined) return known;
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  const utcMidnight = Date.UTC(year, month - 1, day);
  const start = utcMidnight - tzOffsetMinutes(utcMidnight, tz) * MS_PER_MINUTE;
  baseStarts.set(key, start);
  return start;
}

/** 定时块的绝对起止；未定时块返回 null。 */
export function blockInterval(block: BlockView, base: BaseView): Interval | null {
  if (block.start_minute === null) return null;
  const start = baseStartUtcMs(base.date, base.tz) + block.start_minute * MS_PER_MINUTE;
  return { start, end: start + (block.duration_min ?? 0) * MS_PER_MINUTE };
}

/** 在某个绝对时刻，这个时区比 UTC 快多少分钟（东八区是 480）。 */
function tzOffsetMinutes(utcMs: number, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value);
  const wallClockAsUtc = Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
  return (wallClockAsUtc - utcMs) / MS_PER_MINUTE;
}
