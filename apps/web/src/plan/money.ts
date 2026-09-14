/** 分写成「¥300」「¥38.50」「¥1,200」：整元不带小数，有角分写两位，千位加逗号。 */
export function formatYuan(cents: number): string {
  const yuan = String(Math.floor(cents / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fen = cents % 100;
  return fen === 0 ? `¥${yuan}` : `¥${yuan}.${String(fen).padStart(2, "0")}`;
}

export type ParsedYuan = { ok: true; cents: number | null } | { ok: false };

/** 按元填的金额框：空着 = 没填；不小于 0、最多两位小数才合法，存成分。 */
export function parseYuan(text: string): ParsedYuan {
  if (text === "") return { ok: true, cents: null };
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return { ok: false };
  return { ok: true, cents: Math.round(Number(text) * 100) };
}
