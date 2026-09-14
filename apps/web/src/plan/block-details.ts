import type { Parsed } from "./day-budget";

/** 距离按公里填，不小于 0、最多一位小数，存成米：「32.5」→ 32500；空着就是不写。 */
export function parseDistanceKm(text: string): Parsed<number> {
  if (text === "") return { ok: true, value: null };
  if (!/^\d+(\.\d)?$/.test(text)) return { ok: false };
  return { ok: true, value: Math.round(Number(text) * 1000) };
}

/** 米换回公里，最多一位小数：32500 →「32.5」。 */
export function distanceKmText(meters: number): string {
  return String(Math.round(meters / 100) / 10);
}
