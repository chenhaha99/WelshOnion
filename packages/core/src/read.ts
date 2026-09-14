/**
 * 读取入口：业务代码只通过这里读计划文档和资料库文档，不直接碰 Y.Map。
 *
 * - 可以不填的字段，在 Y.Map 里不存在时一律读成 null（Y.Map.get 对不存在的键返回 undefined）
 * - 两边同时修改合并出来的状态（指不到的引用、重复或残留的排序项等）在这里统一处理，
 *   写入时不可能拦住它们
 */
import * as Y from "yjs";
import { compareBases, compareStrings } from "./order";

export type Slot = "morning" | "afternoon" | "evening";
export type TransportMode = "drive" | "transit" | "walk";
export type Basis = "per_person" | "total";
export type DayFlag = "leave" | "makeup";
export type PlainObject = Readonly<Record<string, unknown>>;

export interface KindView {
  id: string;
  name: string;
  color: string;
  layer: number;
  builtin: boolean;
  order: number;
}

export interface StatusView {
  id: string;
  name: string;
  color: string;
  builtin: boolean;
  order: number;
}

export interface PlaceView {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  providers: PlainObject;
}

export interface PlanIndexEntryView {
  plan_id: string;
  name: string;
  date_start: string | null;
  date_end: string | null;
  day_count: number;
  traveler_count: number;
  last_opened_at: string | null;
}

export interface LibraryView {
  kinds: ReadonlyMap<string, KindView>;
  statuses: ReadonlyMap<string, StatusView>;
  places: ReadonlyMap<string, PlaceView>;
  planIndex: ReadonlyMap<string, PlanIndexEntryView>;
}

/** 指不到资料库时保留原 id 并标记已删除，界面据此显示「已删除的类型 / 状态」。 */
export type KindRef = { id: string; deleted: true } | (KindView & { deleted: false });
export type StatusRef = { id: string; deleted: true } | (StatusView & { deleted: false });

export interface PlanSettingsView {
  name: string;
  traveler_count: number;
  base_currency: string;
  default_day_budget: PlainObject | null;
  cost_per_km_cents: number | null;
}

export interface BaseView {
  id: string;
  date: string;
  tz: string;
  day_flag: DayFlag | null;
  day_budget: PlainObject | null;
}

export interface BlockView {
  id: string;
  start_base_id: string;
  start_minute: number | null;
  duration_min: number | null;
  slot: Slot | null;
  kind: KindRef;
  status: StatusRef;
  layer: number | null;
  indent: number | null;
  title: string;
  place_ids: string[];
  places: PlaceView[];
  subtitle: string | null;
  transport_mode: TransportMode | null;
  distance_m: number | null;
  created_by: string;
  note: string | null;
}

export interface ExpenseView {
  id: string;
  amount_cents: number | null;
  currency: string;
  basis: Basis;
  kind: KindRef;
  title: string;
  block_ids: string[];
  created_by: string;
}

/** 一天的未定时块，按格子分组；slot 为 null 的归「整天」（day）。 */
export interface UndatedGroups {
  day: string[];
  morning: string[];
  afternoon: string[];
  evening: string[];
}

export interface PlanView {
  planId: string;
  plan: PlanSettingsView;
  /** 先按日期、再按 id 排好序；「第几天」就是这个顺序。 */
  bases: BaseView[];
  blocks: ReadonlyMap<string, BlockView>;
  expenses: ReadonlyMap<string, ExpenseView>;
  undated: ReadonlyMap<string, UndatedGroups>;
}

export interface PlanSummary {
  name: string;
  traveler_count: number;
  date_start: string | null;
  date_end: string | null;
  day_count: number;
}

type Record_ = Y.Map<unknown>;

export function readLibrary(doc: Y.Doc): LibraryView {
  const kinds = new Map<string, KindView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("kinds"))) {
    kinds.set(id, {
      id,
      name: required(map, "name"),
      color: required(map, "color"),
      layer: required(map, "layer"),
      builtin: map.get("builtin") === true,
      order: required(map, "order"),
    });
  }

  const statuses = new Map<string, StatusView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("statuses"))) {
    statuses.set(id, {
      id,
      name: required(map, "name"),
      color: required(map, "color"),
      builtin: map.get("builtin") === true,
      order: required(map, "order"),
    });
  }

  const places = new Map<string, PlaceView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("places"))) {
    const providers = map.get("providers");
    places.set(id, {
      id,
      name: required(map, "name"),
      address: optional(map, "address"),
      lat: required(map, "lat"),
      lng: required(map, "lng"),
      providers: providers instanceof Y.Map ? (providers.toJSON() as PlainObject) : {},
    });
  }

  const planIndex = new Map<string, PlanIndexEntryView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("plan_index"))) {
    planIndex.set(id, {
      plan_id: id,
      name: required(map, "name"),
      date_start: optional(map, "date_start"),
      date_end: optional(map, "date_end"),
      day_count: required(map, "day_count"),
      traveler_count: required(map, "traveler_count"),
      last_opened_at: optional(map, "last_opened_at"),
    });
  }

  return { kinds, statuses, places, planIndex };
}

export function readPlan(doc: Y.Doc, library: LibraryView): PlanView {
  const planMap = doc.getMap("plan");
  const plan: PlanSettingsView = {
    name: required(planMap, "name"),
    traveler_count: required(planMap, "traveler_count"),
    base_currency: required(planMap, "base_currency"),
    default_day_budget: optional(planMap, "default_day_budget"),
    cost_per_km_cents: optional(planMap, "cost_per_km_cents"),
  };

  const baseMaps = doc.getMap<Record_>("bases");
  const bases: BaseView[] = [...baseMaps.entries()]
    .map(([id, map]) => ({
      id,
      date: required<string>(map, "date"),
      tz: required<string>(map, "tz"),
      day_flag: optional<DayFlag>(map, "day_flag"),
      day_budget: optional<PlainObject>(map, "day_budget"),
    }))
    .sort(compareBases);

  const blocks = new Map<string, BlockView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("blocks"))) {
    const startBaseId = required<string>(map, "start_base_id");
    // 底座已经被删（两边同时改会出现）：这个块当成已删除
    if (!baseMaps.has(startBaseId)) continue;

    const startMinute = optional<number>(map, "start_minute");
    const places = stringList(map, "place_ids").flatMap((placeId) => {
      const place = library.places.get(placeId);
      return place ? [place] : [];
    });
    blocks.set(id, {
      id,
      start_base_id: startBaseId,
      start_minute: startMinute,
      duration_min: optional(map, "duration_min"),
      slot: optional(map, "slot"),
      kind: kindRef(library, required(map, "kind_id")),
      status: statusRef(library, required(map, "status_id")),
      // 同时存了 layer 和 indent 时，排了时间只认 layer，没排时间只认 indent
      layer: startMinute === null ? null : optional(map, "layer"),
      indent: startMinute === null ? optional(map, "indent") : null,
      title: required(map, "title"),
      place_ids: places.map((place) => place.id),
      places,
      subtitle: optional(map, "subtitle"),
      transport_mode: optional(map, "transport_mode"),
      distance_m: optional(map, "distance_m"),
      created_by: required(map, "created_by"),
      note: textOrNull(map, "note"),
    });
  }

  const expenses = new Map<string, ExpenseView>();
  for (const [id, map] of sortedEntries(doc.getMap<Record_>("expenses"))) {
    expenses.set(id, {
      id,
      amount_cents: optional(map, "amount_cents"),
      currency: required(map, "currency"),
      basis: required(map, "basis"),
      kind: kindRef(library, required(map, "kind_id")),
      title: required(map, "title"),
      block_ids: stringList(map, "block_ids").filter((blockId) => blocks.has(blockId)),
      created_by: required(map, "created_by"),
    });
  }

  const undated = new Map<string, UndatedGroups>();
  for (const [baseId, baseMap] of baseMaps.entries()) {
    undated.set(baseId, groupBySlot(undatedOrder(baseId, baseMap, blocks), blocks));
  }

  return {
    planId: required(doc.getMap("meta"), "plan_id"),
    plan,
    bases,
    blocks,
    expenses,
    undated,
  };
}

export function summarizePlan(view: PlanView): PlanSummary {
  // bases 已按日期排好，去重后首尾就是起止日期
  const dates = [...new Set(view.bases.map((base) => base.date))];
  return {
    name: view.plan.name,
    traveler_count: view.plan.traveler_count,
    date_start: dates[0] ?? null,
    date_end: dates[dates.length - 1] ?? null,
    day_count: dates.length,
  };
}

/** 计划索引是摘要缓存：以本机实际存在的计划文档为准。 */
export function reconcilePlanIndex(
  indexIds: Iterable<string>,
  existingIds: Iterable<string>,
): { remove: string[]; add: string[] } {
  const index = [...indexIds];
  const existing = [...existingIds];
  const indexSet = new Set(index);
  const existingSet = new Set(existing);
  return {
    remove: index.filter((id) => !existingSet.has(id)),
    add: existing.filter((id) => !indexSet.has(id)),
  };
}

/**
 * undated 数组只是排序提示，成员由 blocks 算出：
 * 按数组顺序取，跳过已删和已排时间的，重复的只认第一次；不在数组里的排最后，按 id 排。
 */
function undatedOrder(baseId: string, baseMap: Record_, blocks: ReadonlyMap<string, BlockView>): string[] {
  const members = new Set<string>();
  for (const block of blocks.values()) {
    if (block.start_base_id === baseId && block.start_minute === null) {
      members.add(block.id);
    }
  }

  const placed = new Set<string>();
  for (const id of stringList(baseMap, "undated")) {
    if (members.has(id)) placed.add(id);
  }
  const rest = [...members].filter((id) => !placed.has(id)).sort(compareStrings);
  return [...placed, ...rest];
}

function groupBySlot(order: string[], blocks: ReadonlyMap<string, BlockView>): UndatedGroups {
  const groups: UndatedGroups = { day: [], morning: [], afternoon: [], evening: [] };
  for (const id of order) {
    groups[blocks.get(id)?.slot ?? "day"].push(id);
  }
  return groups;
}

function kindRef(library: LibraryView, id: string): KindRef {
  const kind = library.kinds.get(id);
  return kind ? { ...kind, deleted: false } : { id, deleted: true };
}

function statusRef(library: LibraryView, id: string): StatusRef {
  const status = library.statuses.get(id);
  return status ? { ...status, deleted: false } : { id, deleted: true };
}

/** 唯一把「键不存在」读成 null 的地方。 */
function optional<T>(map: Record_, key: string): T | null {
  const value = map.get(key);
  return value === undefined ? null : (value as T);
}

function required<T>(map: Record_, key: string): T {
  return map.get(key) as T;
}

function textOrNull(map: Record_, key: string): string | null {
  const value = optional<unknown>(map, key);
  return value instanceof Y.Text ? value.toString() : null;
}

function stringList(map: Record_, key: string): string[] {
  const value = optional<unknown>(map, key);
  return value instanceof Y.Array ? (value.toArray() as string[]) : [];
}

function sortedEntries(map: Y.Map<Record_>): [string, Record_][] {
  return [...map.entries()].sort(([a], [b]) => compareStrings(a, b));
}
