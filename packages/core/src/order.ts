export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 底座的顺序：先按日期，同一天再按 id（UUIDv7 自带创建先后）。「第几天」就是这个顺序。 */
export function compareBases(a: { date: string; id: string }, b: { date: string; id: string }): number {
  return compareStrings(a.date, b.date) || compareStrings(a.id, b.id);
}
