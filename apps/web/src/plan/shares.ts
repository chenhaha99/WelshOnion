import {
  fillProgress,
  moneySummary,
  passesFilter,
  timeByKind,
  unscheduledMinutes,
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

/** 「待定 3 件 · 完成 8 件，共 12 件」（按筛选算）；三档都是「确定」时是 null。只写件数，不写百分比、不叫完成率：那是评判。 */
export function checkLine(plan: PlanView, filter?: StatsFilter): string | null {
  const blocks = [...plan.blocks.values()].filter((block) => passesFilter(block, filter));
  const pending = blocks.filter((block) => block.mark === "pending").length;
  const done = blocks.filter((block) => block.mark === "done").length;
  if (pending === 0 && done === 0) return null;
  const parts = [pending > 0 ? `待定 ${pending} 件` : "", done > 0 ? `完成 ${done} 件` : ""].filter((part) => part !== "");
  return `${parts.join(" · ")}，共 ${blocks.length} 件`;
}

/** 环上最多画几段：多了分不清（调研：5–6 段封顶），第 6 段以后并成一段。 */
const RING_MAX = 6;
const MERGED_COLOR = "#9aa3ad";

/** 同心双环里的一类：外圈是它的开销，内圈是它的时间。 */
export interface RingRow {
  kindId: string;
  name: string;
  color: string;
  /** 这一类填了金额的合计（分） */
  cents: number;
  /** 占开销的几成；一笔都没填金额时是 null */
  moneyPercent: number | null;
  /** 这一类实际占到的分钟 */
  minutes: number;
  /** 占时间的几成；一件排了时间的事都没有时是 null */
  timePercent: number | null;
  /** 贴在环外的字：有开销写金额，只有时间写时长 */
  label: string;
  /** 并进来的那几类的名字（只有「其余 N 类」那一段有） */
  merged?: string[];
}

export interface Rings {
  rows: RingRow[];
  moneyTotalCents: number;
  /** 排了多久（分钟）：内圈实心的那部分 */
  minutesTotal: number;
  /** 还没排多久（分钟）：内圈末尾那一段灰的 */
  unscheduledMinutes: number;
  /** 一笔开销都没填金额时写的那句；填了就是 null */
  moneyEmpty: string | null;
  /** 一件排了时间的事都没有时写的那句 */
  timeEmpty: string | null;
}

/**
 * 同心双环要画的数据：一个类型一行，外圈按 `cents`、内圈按 `minutes`。
 * 按开销从多到少排（开销一样多的按时间），第 6 类以后并成「其余 N 类」；两圈的百分比各算各的。
 */
export function ringRows(
  plan: PlanView,
  library: LibraryView,
  includeBaseLayer: boolean,
  filter?: StatsFilter,
): Rings {
  const money = moneyShares(plan, library, filter);
  const time = timeShares(plan, library, includeBaseLayer, filter);
  const byKind = new Map<string, RingRow>();
  const take = (kindId: string, name: string, color: string): RingRow => {
    const has = byKind.get(kindId);
    if (has) return has;
    const row: RingRow = { kindId, name, color, cents: 0, moneyPercent: null, minutes: 0, timePercent: null, label: "" };
    byKind.set(kindId, row);
    return row;
  };
  for (const row of money.rows) {
    const into = take(row.kindId, row.name, row.color);
    into.cents = row.cents;
    into.moneyPercent = row.percent;
  }
  for (const row of time.rows) {
    const into = take(row.kindId, row.name, row.color);
    into.minutes = row.minutes;
    into.timePercent = row.percent;
  }

  const order = (row: RingRow) => library.kinds.get(row.kindId)?.order ?? Number.POSITIVE_INFINITY;
  // 两圈都画不出来的类型（只有没填金额的开销、又没排时间）不上环：不然环外会多一个指不到任何一段的标签。
  // 这几笔没填金额的开销在环下面那句「还有 K 笔没填」里算着
  const rows = [...byKind.values()]
    .filter((row) => row.cents > 0 || row.minutes > 0)
    .sort(
    (a, b) => b.cents - a.cents || b.minutes - a.minutes || order(a) - order(b),
  );

  const shown = rows.length > RING_MAX ? rows.slice(0, RING_MAX - 1) : rows;
  const rest = rows.slice(shown.length);
  if (rest.length > 0) {
    shown.push({
      kindId: "",
      name: `其余 ${rest.length} 类`,
      color: MERGED_COLOR,
      cents: rest.reduce((sum, row) => sum + row.cents, 0),
      moneyPercent: sumPercent(rest.map((row) => row.moneyPercent)),
      minutes: rest.reduce((sum, row) => sum + row.minutes, 0),
      timePercent: sumPercent(rest.map((row) => row.timePercent)),
      label: "",
      merged: rest.map((row) => row.name),
    });
  }
  for (const row of shown) row.label = ringLabel(row);

  return {
    rows: shown,
    moneyTotalCents: moneySummary(plan, filter).totalCents,
    minutesTotal: time.rows.reduce((sum, row) => sum + row.minutes, 0),
    unscheduledMinutes: plan.bases.reduce((sum, base) => sum + unscheduledMinutes(plan, base.id, filter), 0),
    moneyEmpty: money.rows.some((row) => row.percent !== null) ? null : moneyNoteLabel(money),
    timeEmpty: time.rows.length > 0 ? null : timeEmptyLabel(time),
  };
}

/** 并起来的那几类的百分比：全是 null（都不进比例）就还是 null。 */
function sumPercent(percents: Array<number | null>): number | null {
  const real = percents.filter((percent): percent is number => percent !== null);
  return real.length === 0 ? null : real.reduce((sum, percent) => sum + percent, 0);
}

/** 贴在环外的字：有开销写金额和占开销几成，只有时间的写时长和占时间几成。 */
function ringLabel(row: RingRow): string {
  if (row.cents > 0 && row.moneyPercent !== null) return `${row.name} ${formatYuan(row.cents)} · ${row.moneyPercent}%`;
  if (row.minutes > 0 && row.timePercent !== null) return `${row.name} ${durationLabel(row.minutes)} · ${row.timePercent}%`;
  return row.name;
}
