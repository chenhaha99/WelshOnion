import {
  fillProgress,
  moneySummary,
  passesFilter,
  timeByKind,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { durationLabel } from "./block-time";
import { formatYuan } from "./money";

const DELETED_COLOR = "#9aa3ad";
/** 被删掉的类型合成一类时用的键：类型 id 不会是空字符串 */
const DELETED_KIND = "";

/** 按大小算取整百分比（最大余数法）：先都往下取整，差几个百分点就给小数部分最大的几项各加 1，加起来正好 100。 */
export function sharePercents(values: readonly number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0);
  const exact = values.map((value) => (value * 100) / total);
  const percents = exact.map((value) => Math.floor(value));
  const missing = 100 - percents.reduce((sum, value) => sum + value, 0);
  const byRemainder = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder.slice(0, missing)) {
    percents[index] = percents[index]! + 1;
  }
  return percents;
}

interface KindLook {
  name: string;
  color: string;
}

function kindLook(library: LibraryView, key: string): KindLook {
  const kind = library.kinds.get(key);
  return kind ? { name: kind.name, color: kind.color } : { name: "已删除的类型", color: DELETED_COLOR };
}

/** 指不到的类型合成一类「已删除的类型」：表格里它们也分不出彼此。 */
function byShownKind(values: ReadonlyMap<string, number>, library: LibraryView): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const [kindId, value] of values) {
    const key = library.kinds.has(kindId) ? kindId : DELETED_KIND;
    grouped.set(key, (grouped.get(key) ?? 0) + value);
  }
  return grouped;
}

/** 从多到少；一样多时按类型顺序，已删除的类型排后面。 */
function sortedByValue(values: ReadonlyMap<string, number>, library: LibraryView): Array<[string, number]> {
  const order = (key: string) => library.kinds.get(key)?.order ?? Number.POSITIVE_INFINITY;
  return [...values.entries()].sort((a, b) => b[1] - a[1] || order(a[0]) - order(b[0]));
}

export interface MoneyShareRow extends KindLook {
  kindId: string;
  /** 这类填了金额的合计（分，人均的已按人数乘过） */
  cents: number;
  /** 这类全没填时是 null：不进比例 */
  percent: number | null;
  /** 这类还有几笔没填金额 */
  unfilled: number;
}

export interface MoneyShares {
  filledCount: number;
  unfilledCount: number;
  /** 填了金额的类从多到少，全没填的类排在最后 */
  rows: MoneyShareRow[];
}

/** 开销的占比：按开销自己的类型，只算填了金额的；总数是 0 的类不进比例。 */
export function moneyShares(plan: PlanView, library: LibraryView, filter?: StatsFilter): MoneyShares {
  const summary = moneySummary(plan, filter);
  const progress = fillProgress(plan, filter);
  const filled = byShownKind(summary.byKind, library);
  const unfilled = byShownKind(progress.unfilledByKind, library);

  const filledEntries = sortedByValue(filled, library);
  const percents = sharePercents(filledEntries.map(([, cents]) => cents));
  const rows: MoneyShareRow[] = filledEntries.map(([kindId, cents], index) => ({
    ...kindLook(library, kindId),
    kindId,
    cents,
    percent: percents[index]!,
    unfilled: unfilled.get(kindId) ?? 0,
  }));

  const unfilledOnly = new Map([...unfilled].filter(([kindId]) => !filled.has(kindId)));
  for (const [kindId, count] of sortedByValue(unfilledOnly, library)) {
    rows.push({ ...kindLook(library, kindId), kindId, cents: 0, percent: null, unfilled: count });
  }

  return { filledCount: progress.filledCount, unfilledCount: progress.expenseCount - progress.filledCount, rows };
}

/** 「住宿 ¥1,200 · 67%」「餐饮 ¥600 · 33% · 还有 1 笔没填」「购物 · 还有 1 笔没填」 */
export function moneyRowLabel(row: MoneyShareRow): string {
  const head = row.percent === null ? row.name : `${row.name} ${formatYuan(row.cents)} · ${row.percent}%`;
  return row.unfilled > 0 ? `${head} · 还有 ${row.unfilled} 笔没填` : head;
}

/** 开销的占比旁边那句；全填了、也有能进比例的，就不用写。 */
export function moneyNoteLabel(shares: MoneyShares): string | null {
  if (shares.filledCount === 0) return "还没有填了金额的开销";
  if (!shares.rows.some((row) => row.percent !== null)) return `填了金额的 ${shares.filledCount} 笔加起来是 ¥0`;
  if (shares.unfilledCount > 0) return `只算已填的 ${shares.filledCount} 笔，还有 ${shares.unfilledCount} 笔没填`;
  return null;
}

export interface TimeShareRow extends KindLook {
  kindId: string;
  minutes: number;
  percent: number;
}

export interface TimeShares {
  /** 从多到少 */
  rows: TimeShareRow[];
  /** 层为 0 的类型名（默认不算进时间占比的那些），按类型顺序 */
  baseLayerNames: string[];
  /** 最底层的类型实际占到的分钟；是 0 时勾不勾「算上最底层的类型」都一样 */
  baseLayerMinutes: number;
}

/** 时间的占比：按类型、用占用法算的分钟；分母是算进来的几类的合计；层 0 的类型默认不算，没排时间的块不进。 */
export function timeShares(
  plan: PlanView,
  library: LibraryView,
  includeBaseLayer: boolean,
  filter?: StatsFilter,
): TimeShares {
  const withBase = timeByKind(plan, library, { includeBaseLayer: true, filter });
  const withoutBase = timeByKind(plan, library, { filter });
  const { minutes } = includeBaseLayer ? withBase : withoutBase;
  const entries = sortedByValue(byShownKind(minutes, library), library);
  const percents = sharePercents(entries.map(([, value]) => value));
  const rows = entries.map(([kindId, value], index) => ({
    ...kindLook(library, kindId),
    kindId,
    minutes: value,
    percent: percents[index]!,
  }));
  const baseLayerNames = [...library.kinds.values()]
    .filter((kind) => kind.layer === 0)
    .sort((a, b) => a.order - b.order)
    .map((kind) => kind.name);
  return { rows, baseLayerNames, baseLayerMinutes: withBase.total - withoutBase.total };
}

/** 「游玩 3 小时 · 75%」 */
export function timeRowLabel(row: TimeShareRow): string {
  return `${row.name} ${durationLabel(row.minutes)} · ${row.percent}%`;
}

/** 时间的占比一行都没有时写的那句：这时停留要是占到了时间，就是没勾算上它；明明排了停留，就不能说没排。 */
export function timeEmptyLabel(shares: TimeShares): string {
  return shares.baseLayerMinutes > 0
    ? `除了${shares.baseLayerNames.join("、")}，还没有排了时间的事`
    : "还没有排了时间的事";
}

/** 「划掉 8 件，共 12 件」（按筛选算）；一件都没划掉是 null。不写百分比、不叫完成率：划掉的含义用户自己定。 */
export function checkLine(plan: PlanView, filter?: StatsFilter): string | null {
  const blocks = [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
  const pending = blocks.filter((block) => block.mark === "pending").length;
  const struck = blocks.filter((block) => block.mark === "struck").length;
  if (pending === 0 && struck === 0) return null;
  const parts = [pending > 0 ? `待定 ${pending} 件` : "", struck > 0 ? `划掉 ${struck} 件` : ""].filter((part) => part !== "");
  return `${parts.join(" · ")}，共 ${blocks.length} 件`;
}
