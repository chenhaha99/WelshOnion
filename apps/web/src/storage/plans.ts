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

export interface PlanFileDownload {
  /** 计划名，提示「已导出」用 */
  name: string;
  fileName: string;
  text: string;
}

/** 导出一个计划：打开本机存着的计划文档交给 core 导出，再关掉；本机没有就报错（同复制）。 */
export async function exportPlanFile(library: Y.Doc, planId: string, now: string): Promise<PlanFileDownload> {
  const stored = await loadPlan(planId);
  if (!stored) {
    await deleteDatabase(planDbName(planId));
    throw new core.DocumentError("NOT_INITIALIZED", `本机没有计划 ${planId}`);
  }
  const text = core.exportPlan(library, stored.doc, now);
  const name = core.readPlan(stored.doc, core.readLibrary(library)).plan.name;
  await stored.close();
  return { name, fileName: planFileName(name), text };
}

/**
 * 首页读一个计划的内容（迷你时间线、今天的下一件）：只读，读完就关，不接标签页同步、不改最近打开。
 * 本机没有（打开时顺手建出了空数据库）就删掉那个空库，返回 null。
 */
export async function readPlanPreview(library: Y.Doc, planId: string): Promise<core.PlanView | null> {
  const stored = await loadPlan(planId);
  if (!stored) {
    await deleteDatabase(planDbName(planId));
    return null;
  }
  const view = core.readPlan(stored.doc, core.readLibrary(library));
  await stored.close();
  return view;
}

/** 「计划名.welshonion.json」：文件名不能用的字符（按最严的 Windows）换成下划线，空了用「未命名计划」。 */
export function planFileName(name: string): string {
  const safe = [...name].map((char) => (char < " " || '\\/:*?"<>|'.includes(char) ? "_" : char)).join("").trim();
  return `${safe === "" ? "未命名计划" : safe}.welshonion.json`;
}

export type ImportPlanFileResult =
  | { ok: true; handle: PlanHandle }
  | { ok: false; error: "FILE_NOT_PLAN" | "FILE_TOO_NEW" };

/**
 * 从文件导入一个计划：读不了就返回原因，什么都不建。本机已经存着同一个计划时，用新 id、名字后面加「（导入）」另存一份，
 * 原来那份不动（按本机存着的数据库判断，索引只是缓存）。新计划和新建一样开着交给调用方。
 */
export async function importPlanFile(library: Y.Doc, text: string, now: string): Promise<ImportPlanFileResult> {
  const parsed = core.parsePlanFile(text);
  if (!parsed.ok) return { ok: false, error: parsed.error.code === "FILE_TOO_NEW" ? "FILE_TOO_NEW" : "FILE_NOT_PLAN" };
  const file = parsed.value;
  const exists = (await storedPlanIds()).includes(file.planId);
  const planId = exists ? core.newId() : file.planId;
  const stored = await loadStoredDoc(planDbName(planId));
  core.importPlan(library, stored.doc, file, { planId, now, ...(exists ? { name: `${file.name}（导入）` } : {}) });
  stored.startTabSync();
  return { ok: true, handle: { planId, doc: stored.doc, close: stored.close } };
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
