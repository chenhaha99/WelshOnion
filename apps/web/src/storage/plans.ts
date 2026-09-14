import * as core from "@welshonion/core";
import type * as Y from "yjs";
import { planDbName, planIdOf } from "./names";
import {
  deleteDatabase,
  isNotInitialized,
  loadStoredDoc,
  storedDbNames,
  type DocHandle,
  type StoredDoc,
} from "./stored-doc";

export interface PlanHandle extends DocHandle {
  readonly planId: string;
}

/** 先建计划文档再写索引，这个顺序由 core 的 createPlan 保证。 */
export async function createPlan(library: Y.Doc, options: { name?: string; now: string }): Promise<PlanHandle> {
  const planId = core.newId();
  const stored = await loadStoredDoc(planDbName(planId));
  core.createPlan(library, stored.doc, { planId, name: options.name, now: options.now });
  stored.startTabSync();
  return { planId, doc: stored.doc, close: stored.close };
}

/**
 * 复制计划：先打开源计划（本机没有就失败，不建新文档），再用新 id 建一份、按 core 复制；
 * 关掉源计划，新计划和新建一样开着交给调用方。
 */
export async function duplicatePlan(
  library: Y.Doc,
  sourcePlanId: string,
  options: { name: string; startDate?: string; now: string },
): Promise<PlanHandle> {
  const source = await loadPlan(sourcePlanId);
  if (!source) {
    await deleteDatabase(planDbName(sourcePlanId));
    throw new core.DocumentError("NOT_INITIALIZED", `本机没有计划 ${sourcePlanId}`);
  }
  const planId = core.newId();
  const stored = await loadStoredDoc(planDbName(planId));
  const result = core.duplicatePlan(library, source.doc, stored.doc, { planId, ...options });
  await source.close();
  if (!result.ok) {
    await stored.close();
    await deleteDatabase(planDbName(planId));
    throw new Error(`复制计划失败：${JSON.stringify(result.error)}`);
  }
  stored.startTabSync();
  return { planId, doc: stored.doc, close: stored.close };
}

export async function openPlan(library: Y.Doc, planId: string, now: string): Promise<PlanHandle> {
  const stored = await loadPlan(planId);
  if (!stored) {
    // 打开时顺手建出了空数据库；要打开的 id 来自索引，索引在初始化之后才写，所以不会误删正在新建的计划
    await deleteDatabase(planDbName(planId));
    throw new core.DocumentError("NOT_INITIALIZED", `本机没有计划 ${planId}`);
  }
  stored.startTabSync();
  core.touchPlan(library, stored.doc, now);
  return { planId, doc: stored.doc, close: stored.close };
}

/** 先删本机的计划文档，再删索引：反过来的话，中途中断会让对账把计划补回来。 */
export async function deletePlan(library: Y.Doc, planId: string): Promise<core.OpResult> {
  await deleteDatabase(planDbName(planId));
  return core.deletePlan(library, planId);
}

export async function storedPlanIds(): Promise<string[]> {
  return (await storedDbNames()).flatMap((name) => {
    const planId = planIdOf(name);
    return planId === null ? [] : [planId];
  });
}

/**
 * 按本机实际存着的计划文档修正索引：没文档的删掉；有文档没索引的补上，最后打开时间记成 now。
 * 没初始化的文档只跳过不删：别的标签页可能刚建出数据库、还没写进内容。
 */
export async function reconcilePlans(library: Y.Doc, now: string): Promise<void> {
  const indexIds = [...core.readLibrary(library).planIndex.keys()];
  const { remove, add } = core.reconcilePlanIndex(indexIds, await storedPlanIds());
  for (const planId of remove) core.deletePlan(library, planId);
  for (const planId of add) {
    const stored = await loadPlan(planId);
    if (!stored) continue;
    core.touchPlan(library, stored.doc, now);
    await stored.close();
  }
}

/** 加载计划文档并检查版本；没初始化就关掉、给 null；版本比代码新照样抛错。 */
async function loadPlan(planId: string): Promise<StoredDoc | null> {
  const stored = await loadStoredDoc(planDbName(planId));
  try {
    core.openPlanDoc(stored.doc);
    return stored;
  } catch (error) {
    await stored.close();
    if (isNotInitialized(error)) return null;
    throw error;
  }
}
