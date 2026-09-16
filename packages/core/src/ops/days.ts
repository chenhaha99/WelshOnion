import * as Y from "yjs";
import { newId } from "../ids";
import { compareBases, compareStrings } from "../order";
import { addDays } from "./dates";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, firstInvalidField, ok, type OpResult } from "./result";
import { removeBlocks } from "./remove";
import { setOrDelete } from "./write";

type YMap = Y.Map<unknown>;

const MINUTES_PER_DAY = 1440;

export interface InsertDayOptions {
  /** 插入位置被跨午夜的块跨过时必须指定：before = 块留在原来那天；after = 块挪到新的一天上 */
  crossingBlocks?: "before" | "after";
}

/** 只在计划还没有底座时可用：建 count 个日期连续的底座。 */
export function setDays(
  planDoc: Y.Doc,
  options: { startDate: string; count: number; tz: string },
): OpResult<{ baseIds: string[] }> {
  const error = firstInvalidField([
    ["date", options.startDate],
    ["tz", options.tz],
  ]);
  if (error) return fail(error);
  if (basesOf(planDoc).size > 0) return fail({ code: "DAYS_ALREADY_SET" });

  const baseIds: string[] = [];
  planDoc.transact(() => {
    for (let i = 0; i < options.count; i++) {
      baseIds.push(createBase(planDoc, addDays(options.startDate, i), options.tz));
    }
  }, LOCAL_ORIGIN);
  return ok({ baseIds });
}

/** 在目标底座下面插一个空天：新底座日期 = 目标日期 + 1，更晚的底座日期都 + 1。 */
export function insertDayBelow(
  planDoc: Y.Doc,
  baseId: string,
  options: InsertDayOptions = {},
): OpResult<{ baseId: string }> {
  const target = basesOf(planDoc).get(baseId);
  if (!target) return fail({ code: "NOT_FOUND", id: baseId });
  const nextDate = addDays(dateOf(target), 1);
  return insertDay(planDoc, { dayAboveId: baseId, newDate: nextDate, tz: tzOf(target), shiftFrom: nextDate }, options);
}

/** 在目标底座上面插一个空天：新底座占用目标原来的日期，目标和更晚的底座日期都 + 1。 */
export function insertDayAbove(
  planDoc: Y.Doc,
  baseId: string,
  options: InsertDayOptions = {},
): OpResult<{ baseId: string }> {
  const target = basesOf(planDoc).get(baseId);
  if (!target) return fail({ code: "NOT_FOUND", id: baseId });
  const ordered = sortedBases(planDoc);
  const previous = ordered[ordered.findIndex((base) => base.id === baseId) - 1];
  const dayAboveId = previous && previous.date === addDays(dateOf(target), -1) ? previous.id : null;
  return insertDay(
    planDoc,
    { dayAboveId, newDate: dateOf(target), tz: tzOf(target), shiftFrom: dateOf(target) },
    options,
  );
}

/** 删掉这天和坐在上面的块，钱按整批规则处理；其他天的日期不变。 */
export function deleteDay(planDoc: Y.Doc, baseId: string): OpResult {
  if (!basesOf(planDoc).has(baseId)) return fail({ code: "NOT_FOUND", id: baseId });
  const onThisDay = [...blocksOf(planDoc).entries()]
    .filter(([, block]) => block.get("start_base_id") === baseId)
    .map(([id]) => id);

  planDoc.transact(() => {
    removeBlocks(planDoc, onThisDay);
    basesOf(planDoc).delete(baseId);
  }, LOCAL_ORIGIN);
  return done();
}

/** 把目标底座挪到排序后的第 toIndex 位，原来那串日期按新顺序重新分配。 */
export function moveDay(planDoc: Y.Doc, baseId: string, toIndex: number): OpResult {
  const ordered = sortedBases(planDoc);
  const from = ordered.findIndex((base) => base.id === baseId);
  if (from === -1) return fail({ code: "NOT_FOUND", id: baseId });
  if (!Number.isInteger(toIndex) || toIndex < 0 || toIndex >= ordered.length) {
    return fail({ code: "INDEX_OUT_OF_RANGE" });
  }

  const dates = ordered.map((base) => base.date);
  const reordered = ordered.filter((base) => base.id !== baseId);
  reordered.splice(toIndex, 0, ordered[from] as SortedBase);
  planDoc.transact(() => {
    reordered.forEach((base, index) => {
      const date = dates[index] as string;
      if (base.date !== date) base.map.set("date", date);
    });
  }, LOCAL_ORIGIN);
  return done();
}

export function shiftAllDays(planDoc: Y.Doc, deltaDays: number): OpResult {
  planDoc.transact(() => {
    for (const base of basesOf(planDoc).values()) {
      base.set("date", addDays(dateOf(base), deltaDays));
    }
  }, LOCAL_ORIGIN);
  return done();
}

export function setDayTz(planDoc: Y.Doc, baseId: string, tz: string): OpResult {
  const error = firstInvalidField([["tz", tz]]);
  if (error) return fail(error);
  const base = basesOf(planDoc).get(baseId);
  if (!base) return fail({ code: "NOT_FOUND", id: baseId });
  planDoc.transact(() => base.set("tz", tz), LOCAL_ORIGIN);
  return done();
}

/** 出境当天：同一个日期再加一个另一个时区的空底座。 */
export function addDayInTz(planDoc: Y.Doc, baseId: string, tz: string): OpResult<{ baseId: string }> {
  const error = firstInvalidField([["tz", tz]]);
  if (error) return fail(error);
  const base = basesOf(planDoc).get(baseId);
  if (!base) return fail({ code: "NOT_FOUND", id: baseId });
  if (tzOf(base) === tz) return fail({ code: "SAME_TZ" });

  let added = "";
  planDoc.transact(() => {
    added = createBase(planDoc, dateOf(base), tz);
  }, LOCAL_ORIGIN);
  return ok({ baseId: added });
}

function insertDay(
  planDoc: Y.Doc,
  plan: { dayAboveId: string | null; newDate: string; tz: string; shiftFrom: string },
  options: InsertDayOptions,
): OpResult<{ baseId: string }> {
  const crossing = plan.dayAboveId === null ? [] : blocksCrossingMidnight(planDoc, plan.dayAboveId);
  if (crossing.length > 0 && options.crossingBlocks === undefined) {
    return fail({ code: "CROSSING_BLOCKS", blockIds: crossing });
  }

  let newBaseId = "";
  planDoc.transact(() => {
    for (const base of basesOf(planDoc).values()) {
      if (dateOf(base) >= plan.shiftFrom) base.set("date", addDays(dateOf(base), 1));
    }
    newBaseId = createBase(planDoc, plan.newDate, plan.tz);
    if (options.crossingBlocks === "after") {
      for (const blockId of crossing) {
        blocksOf(planDoc).get(blockId)?.set("start_base_id", newBaseId);
      }
    }
  }, LOCAL_ORIGIN);
  return ok({ baseId: newBaseId });
}

/** 坐在这天、排了时间、结束时刻超过当天 24:00 的块。 */
function blocksCrossingMidnight(planDoc: Y.Doc, baseId: string): string[] {
  const ids: string[] = [];
  for (const [id, block] of blocksOf(planDoc).entries()) {
    if (block.get("start_base_id") !== baseId) continue;
    const start = block.get("start_minute");
    const duration = block.get("duration_min");
    if (typeof start === "number" && typeof duration === "number" && start + duration > MINUTES_PER_DAY) {
      ids.push(id);
    }
  }
  return ids.sort(compareStrings);
}

function createBase(planDoc: Y.Doc, date: string, tz: string): string {
  const id = newId();
  basesOf(planDoc).set(
    id,
    new Y.Map<unknown>([
      ["date", date],
      ["tz", tz],
      ["undated", new Y.Array<string>()],
    ]),
  );
  return id;
}

interface SortedBase {
  id: string;
  date: string;
  map: YMap;
}

function sortedBases(planDoc: Y.Doc): SortedBase[] {
  return [...basesOf(planDoc).entries()]
    .map(([id, map]) => ({ id, date: dateOf(map), map }))
    .sort(compareBases);
}

function basesOf(planDoc: Y.Doc): Y.Map<YMap> {
  return planDoc.getMap<YMap>("bases");
}

function blocksOf(planDoc: Y.Doc): Y.Map<YMap> {
  return planDoc.getMap<YMap>("blocks");
}

function dateOf(base: YMap): string {
  return base.get("date") as string;
}

function tzOf(base: YMap): string {
  return base.get("tz") as string;
}
