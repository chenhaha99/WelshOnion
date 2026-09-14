/** 日期（YYYY-MM-DD）加减天数。按 UTC 算，结果和运行环境所在的时区无关。 */
export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}
