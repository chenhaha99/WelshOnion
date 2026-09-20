import * as Y from "yjs";
import { readLibrary, readPlan, summarizePlan } from "../read";
import { initPlanDoc } from "../schema";
import type { ValidatedField } from "../validate";
import { addDays } from "./dates";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, firstInvalidField, type OpResult } from "./result";
import { setOrDelete } from "./write";

export interface PlanSettingsPatch {
  traveler_count?: number;
  base_currency?: string;
  cost_per_km_cents?: number | null;
}

/**
 * 先建计划文档，再写计划索引（两个文档进不了同一个事务，写一半中断时只会多出一份没有索引的文档，打开时能补回来）。
 * 新建本身不进撤销。
 */
export function createPlan(
  library: Y.Doc,
  planDoc: Y.Doc,
  options: { planId: string; name?: string; now: string },
): OpResult {
  planDoc.transact(() => {
    initPlanDoc(planDoc, options.planId);
    if (options.name !== undefined) planDoc.getMap("plan").set("name", options.name);
  });
  writeIndexEntry(library, planDoc, options.now);
  return done();
}

export interface DuplicatePlanOptions {
  planId: string;
  name: string;
  /** 新的出发日期；源计划一天都没有时不用给 */
  startDate?: string;
  now: string;
}

/**
 * 把源计划整份复制进一份空的新计划文档：换 id 和名字，所有天平移到新的出发日期（顺序、时区、间隔不变），
 * 划掉的事全部恢复成没划掉（划没划掉是那一趟的事），再写计划索引。复制本身不进撤销，源计划不动。
 */
export function duplicatePlan(library: Y.Doc, source: Y.Doc, target: Y.Doc, options: DuplicatePlanOptions): OpResult {
  if (options.startDate !== undefined) {
    const invalid = firstInvalidField([["date", options.startDate]]);
    if (invalid) return fail(invalid);
  }

  // 整份编码带过去，字段以后加了也不会漏；两份文档里的内部 id 相同不要紧，id 只在各自文档里用
  Y.applyUpdate(target, Y.encodeStateAsUpdate(source));
  target.transact(() => {
    target.getMap("meta").set("plan_id", options.planId);
    target.getMap("plan").set("name", options.name);

    const bases = [...target.getMap<Y.Map<unknown>>("bases").values()];
    const firstDate = bases.map((base) => base.get("date") as string).sort()[0];
    if (firstDate !== undefined && options.startDate !== undefined) {
      const deltaDays = Math.round((Date.parse(`${options.startDate}T00:00:00Z`) - Date.parse(`${firstDate}T00:00:00Z`)) / 86_400_000);
      for (const base of bases) base.set("date", addDays(base.get("date") as string, deltaDays));
    }
    // 复制出来的计划从头开始：标记全清成「定了」
    for (const block of target.getMap<Y.Map<unknown>>("blocks").values()) block.delete("mark");
  });
  writeIndexEntry(library, target, options.now);
  return done();
}

/** 撤销只撤回计划文档里的名字；索引是缓存，下次打开时刷新。 */
export function renamePlan(library: Y.Doc, planDoc: Y.Doc, name: string): OpResult {
  planDoc.transact(() => planDoc.getMap("plan").set("name", name), LOCAL_ORIGIN);
  const entry = library.getMap<Y.Map<unknown>>("plan_index").get(planIdOf(planDoc));
  if (entry) library.transact(() => entry.set("name", name), LOCAL_ORIGIN);
  return done();
}

export function setPlanSettings(planDoc: Y.Doc, patch: PlanSettingsPatch): OpResult {
  const checks: Array<readonly [ValidatedField, unknown]> = [];
  if (patch.traveler_count !== undefined) checks.push(["traveler_count", patch.traveler_count]);
  if (patch.cost_per_km_cents !== undefined) checks.push(["cost_per_km_cents", patch.cost_per_km_cents]);
  const error = firstInvalidField(checks);
  if (error) return fail(error);

  planDoc.transact(() => {
    const plan = planDoc.getMap("plan");
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) setOrDelete(plan, key, value);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 记录「打开过」，并按计划文档的当前内容刷新索引摘要。不进撤销。 */
export function touchPlan(library: Y.Doc, planDoc: Y.Doc, now: string): OpResult {
  writeIndexEntry(library, planDoc, now);
  return done();
}

/** 只删计划索引；计划文档本身由本机存储层删。 */
export function deletePlan(library: Y.Doc, planId: string): OpResult {
  const index = library.getMap("plan_index");
  if (!index.has(planId)) return fail({ code: "NOT_FOUND", id: planId });
  library.transact(() => index.delete(planId), LOCAL_ORIGIN);
  return done();
}

/** 按计划文档的当前内容写它的计划索引（导入计划也用）。 */
export function writeIndexEntry(library: Y.Doc, planDoc: Y.Doc, lastOpenedAt: string): void {
  const view = readPlan(planDoc, readLibrary(library));
  const summary = summarizePlan(view);
  library.transact(() => {
    const index = library.getMap<Y.Map<unknown>>("plan_index");
    let entry = index.get(view.planId);
    if (!entry) {
      entry = new Y.Map<unknown>();
      index.set(view.planId, entry);
    }
    entry.set("name", summary.name);
    entry.set("traveler_count", summary.traveler_count);
    setOrDelete(entry, "date_start", summary.date_start);
    setOrDelete(entry, "date_end", summary.date_end);
    entry.set("day_count", summary.day_count);
    entry.set("last_opened_at", lastOpenedAt);
  }, LOCAL_ORIGIN);
}

function planIdOf(planDoc: Y.Doc): string {
  return planDoc.getMap("meta").get("plan_id") as string;
}
