/**
 * 写入前的单字段范围校验：只拦「不可能是人意图的」取值。
 * 不检查字段之间是否一致（两边同时改合并出来的状态，写入时根本碰不到），也不拦时间重叠、超预算这类业务上的不合理。
 */

export type ValidatedField =
  | "start_minute"
  | "duration_min"
  | "layer"
  | "indent"
  | "slot"
  | "amount_cents"
  | "cost_per_km_cents"
  | "distance_m"
  | "traveler_count"
  | "transport_mode"
  | "basis"
  | "day_flag"
  | "date"
  | "tz"
  | "day_budget";

export type ValidationResult = { ok: true } | { ok: false; field: ValidatedField };

/** 每日时间预算：每一项都可以不填。 */
export interface DayBudget {
  start?: string;
  end?: string;
  max_drive_min?: number;
  max_drive_km?: number;
}

type Check = (value: unknown) => boolean;

const isInteger = (value: unknown): value is number => Number.isInteger(value);
const orNull =
  (check: Check): Check =>
  (value) =>
    value === null || check(value);
const oneOf =
  (...allowed: readonly string[]): Check =>
  (value) =>
    typeof value === "string" && allowed.includes(value);

const CHECKS: Record<ValidatedField, Check> = {
  start_minute: orNull((v) => isInteger(v) && v >= 0 && v <= 1439),
  duration_min: orNull((v) => isInteger(v) && v >= 0),
  layer: orNull((v) => isInteger(v) && v >= 0),
  indent: orNull((v) => isInteger(v) && v >= 0),
  slot: orNull(oneOf("morning", "afternoon", "evening")),
  amount_cents: orNull(isInteger),
  cost_per_km_cents: orNull((v) => isInteger(v) && v >= 0),
  distance_m: orNull((v) => isInteger(v) && v >= 0),
  traveler_count: (v) => isInteger(v) && v >= 1,
  transport_mode: orNull(oneOf("drive", "transit", "walk")),
  basis: oneOf("per_person", "total"),
  day_flag: orNull(oneOf("leave", "makeup")),
  date: isRealDate,
  tz: isKnownTimeZone,
  day_budget: orNull(isDayBudget),
};

export function validateField(field: ValidatedField, value: unknown): ValidationResult {
  return CHECKS[field](value) ? { ok: true } : { ok: false, field };
}

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

const DAY_BUDGET_CHECKS: Readonly<Record<string, Check>> = {
  start: (v) => typeof v === "string" && TIME_OF_DAY.test(v),
  end: (v) => typeof v === "string" && TIME_OF_DAY.test(v),
  max_drive_min: (v) => isInteger(v) && v >= 0,
  max_drive_km: (v) => isInteger(v) && v >= 0,
};

function isDayBudget(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return Object.entries(value).every(([key, item]) => {
    const check = DAY_BUDGET_CHECKS[key];
    return check !== undefined && check(item);
  });
}

function isRealDate(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function isKnownTimeZone(value: unknown): boolean {
  if (typeof value !== "string" || value === "") return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}
