import { baseStartUtcMs } from "@welshonion/core";

/** 常用时区的中文城市名；表里没有的直接显示 IANA 名。改时区的下拉也用这张表。 */
const CITY_NAMES: Readonly<Record<string, string>> = {
  "Asia/Shanghai": "北京",
  "Asia/Hong_Kong": "香港",
  "Asia/Taipei": "台北",
  "Asia/Tokyo": "东京",
  "Asia/Seoul": "首尔",
  "Asia/Bangkok": "曼谷",
  "Asia/Ho_Chi_Minh": "胡志明市",
  "Asia/Singapore": "新加坡",
  "Asia/Kuala_Lumpur": "吉隆坡",
  "Australia/Sydney": "悉尼",
  "Europe/London": "伦敦",
  "Europe/Paris": "巴黎",
  "America/Los_Angeles": "洛杉矶",
  "America/New_York": "纽约",
};

export const COMMON_TIME_ZONES: readonly string[] = Object.keys(CITY_NAMES);

export function cityName(tz: string): string {
  const known = CITY_NAMES[tz];
  if (known) return known;
  // 只有偏移的名字：Etc 里的正负号和习惯相反，Etc/GMT-9 是 UTC+9
  const offsetOnly = /^Etc\/GMT([+-])(\d{1,2})$/.exec(tz);
  if (offsetOnly) return `UTC${offsetOnly[1] === "-" ? "+" : "−"}${Number(offsetOnly[2])}`;
  return tz;
}

/** 有的浏览器把东八区报成只有偏移的 Etc/GMT-8：按北京处理（产品只做中国用户，两者偏移完全一样）。 */
export function normalizeSystemTimeZone(tz: string): string {
  return tz === "Etc/GMT-8" ? "Asia/Shanghai" : tz;
}

/** 当前时刻在某个时区里是哪一天（YYYY-MM-DD）。 */
export function todayIn(nowIso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(
    new Date(nowIso),
  );
}

/** 两个日期（YYYY-MM-DD）相差几天，后减前。 */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

const weekday = new Intl.DateTimeFormat("zh-CN", { weekday: "short", timeZone: "UTC" });

/** 「10.1 周四」。日期按 UTC 解释，不让本机时区把日期推前一天。 */
export function dateWithWeekday(date: string): string {
  const monthDay = `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
  return `${monthDay} ${weekday.format(new Date(`${date}T00:00:00Z`))}`;
}

/**
 * 排好序的底座每行的标签：「第 N 天 · 10.1 周四」。同一日期的底座同一个「第几天」。
 * 计划里有两个以上时区时加「· 城市」，和第一天时区差几小时的再加「+1h」。
 */
export function dayRowLabels(bases: ReadonlyArray<{ date: string; tz: string }>): string[] {
  const firstTz = bases[0]?.tz;
  const multipleZones = new Set(bases.map((base) => base.tz)).size > 1;
  let dayNumber = 0;
  let previousDate: string | null = null;
  return bases.map((base) => {
    if (base.date !== previousDate) {
      dayNumber += 1;
      previousDate = base.date;
    }
    const parts = [`第 ${dayNumber} 天`, dateWithWeekday(base.date)];
    if (multipleZones && firstTz !== undefined) parts.push(zoneLabel(base, firstTz));
    return parts.join(" · ");
  });
}

function zoneLabel(base: { date: string; tz: string }, firstTz: string): string {
  const hours = (baseStartUtcMs(base.date, firstTz) - baseStartUtcMs(base.date, base.tz)) / 3_600_000;
  if (hours === 0) return cityName(base.tz);
  return `${cityName(base.tz)} ${hours > 0 ? "+" : "−"}${Math.abs(hours)}h`;
}
