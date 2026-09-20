import * as Y from "yjs";
import { PRESET_KINDS } from "./presets";

/** 代码支持的文档结构版本。计划文档和资料库文档各自在 meta.schema 里记版本。 */
export const SCHEMA_VERSION = 3;

export type DocumentErrorCode = "SCHEMA_TOO_NEW" | "NOT_INITIALIZED";

export class DocumentError extends Error {
  readonly code: DocumentErrorCode;

  constructor(code: DocumentErrorCode, message: string) {
    super(message);
    this.name = "DocumentError";
    this.code = code;
  }
}

const PLAN_TOP_LEVEL = ["meta", "plan", "bases", "blocks", "expenses"] as const;
const LIBRARY_TOP_LEVEL = ["meta", "kinds", "tags", "places", "plan_index"] as const;

/** 打开时迁移旧版本文档的事务来源：不是本地编辑，不进撤销。 */
const MIGRATION_ORIGIN: object = Object.freeze({ source: "migration" });

export function initPlanDoc(doc: Y.Doc, planId: string): void {
  doc.transact(() => {
    for (const name of PLAN_TOP_LEVEL) {
      doc.getMap(name);
    }
    const meta = doc.getMap("meta");
    meta.set("schema", SCHEMA_VERSION);
    meta.set("plan_id", planId);

    const plan = doc.getMap("plan");
    plan.set("name", "未命名计划");
    plan.set("traveler_count", 1);
    plan.set("base_currency", "CNY");
  });
}

export function initLibraryDoc(doc: Y.Doc): void {
  doc.transact(() => {
    for (const name of LIBRARY_TOP_LEVEL) {
      doc.getMap(name);
    }
    doc.getMap("meta").set("schema", SCHEMA_VERSION);
    seedLibrary(doc);
  });
}

/** 只补缺的预设；已经存在的键一律不动（用户可能改过名字、颜色、层）。 */
export function seedLibrary(doc: Y.Doc): void {
  doc.transact(() => {
    const kinds = doc.getMap<Y.Map<unknown>>("kinds");
    for (const preset of PRESET_KINDS) {
      if (kinds.has(preset.id)) continue;
      kinds.set(
        preset.id,
        new Y.Map<unknown>([
          ["name", preset.name],
          ["color", preset.color],
          ["layer", preset.layer],
          ["builtin", true],
          ["order", preset.order],
        ]),
      );
    }
  });
}

/** 版本比代码新就拒绝打开；比代码旧就先迁移成当前版本。 */
export function openPlanDoc(doc: Y.Doc): void {
  checkSchemaVersion(doc, "计划文档");
  if (doc.getMap("meta").get("schema") !== SCHEMA_VERSION) doc.transact(() => upgradePlanDoc(doc), MIGRATION_ORIGIN);
}

export function openLibraryDoc(doc: Y.Doc): void {
  checkSchemaVersion(doc, "资料库文档");
  if (doc.getMap("meta").get("schema") !== SCHEMA_VERSION) doc.transact(() => upgradeLibraryDoc(doc), MIGRATION_ORIGIN);
}

/**
 * 旧版本的计划文档改成当前版本，事务由调用方开。
 * 1 → 2（2026-09-17 去掉了状态）：每件事删掉 status_id。
 * 2 → 3（2026-09-20 标记从两档变三档）：checked 是 true 的写成 mark = "struck"，其余不写（读出来就是「定了」），删掉 checked。
 */
export function upgradePlanDoc(doc: Y.Doc): void {
  for (const block of doc.getMap<Y.Map<unknown>>("blocks").values()) {
    block.delete("status_id");
    if (block.get("checked") === true) block.set("mark", "struck");
    block.delete("checked");
  }
  doc.getMap("meta").set("schema", SCHEMA_VERSION);
}

/** 1 → 2：清空状态；2 → 3 资料库没变。顶层的 statuses 删不掉（Yjs 的顶层结构建了就一直在），只能留空。 */
function upgradeLibraryDoc(doc: Y.Doc): void {
  const statuses = doc.getMap("statuses");
  for (const id of [...statuses.keys()]) statuses.delete(id);
  doc.getMap("meta").set("schema", SCHEMA_VERSION);
}

function checkSchemaVersion(doc: Y.Doc, label: string): void {
  const schema = doc.getMap("meta").get("schema") as number | undefined;
  if (schema === undefined) {
    throw new DocumentError("NOT_INITIALIZED", `${label}不存在或没有初始化`);
  }
  if (schema > SCHEMA_VERSION) {
    throw new DocumentError(
      "SCHEMA_TOO_NEW",
      `${label}的结构版本是 ${schema}，比这个版本的程序支持的 ${SCHEMA_VERSION} 新，请升级`,
    );
  }
}
