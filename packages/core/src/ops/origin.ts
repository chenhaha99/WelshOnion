import * as Y from "yjs";

/**
 * 本机所有操作共用的来源标记。撤销只跟踪带着它的事务，
 * 所以别人同步过来的改动（带着别的来源）不会被撤掉。
 */
export const LOCAL_ORIGIN: object = Object.freeze({ source: "local" });

const PLAN_TOP_LEVEL = ["meta", "plan", "bases", "blocks", "expenses"] as const;

/**
 * 计划文档的撤销管理器：
 * - 范围覆盖全部 5 个顶层结构，跨结构的操作（删一天要同时删底座和块）才能一次撤干净
 * - captureTimeout 为 0，相邻两次操作不会被并成一步
 */
export function createPlanUndoManager(planDoc: Y.Doc): Y.UndoManager {
  return new Y.UndoManager(
    PLAN_TOP_LEVEL.map((name) => planDoc.getMap(name)),
    { captureTimeout: 0, trackedOrigins: new Set([LOCAL_ORIGIN]) },
  );
}
