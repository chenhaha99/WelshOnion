import * as Y from "yjs";
import { PRESET_KINDS, PRESET_STATUSES } from "./presets";

/** 代码支持的文档结构版本。计划文档和资料库文档各自在 meta.schema 里记版本。 */
export const SCHEMA_VERSION = 1;

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
const LIBRARY_TOP_LEVEL = ["meta", "kinds", "statuses", "places", "plan_index"] as const;

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

    const statuses = doc.getMap<Y.Map<unknown>>("statuses");
    for (const preset of PRESET_STATUSES) {
      if (statuses.has(preset.id)) continue;
      statuses.set(
        preset.id,
        new Y.Map<unknown>([
          ["name", preset.name],
          ["color", preset.color],
          ["builtin", true],
          ["order", preset.order],
        ]),
      );
    }
  });
}

export function openPlanDoc(doc: Y.Doc): void {
  checkSchemaVersion(doc, "计划文档");
}

export function openLibraryDoc(doc: Y.Doc): void {
  checkSchemaVersion(doc, "资料库文档");
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
