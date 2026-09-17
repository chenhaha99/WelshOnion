import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { createPlanUndoManager } from "./ops/origin";
import {
  DocumentError,
  initLibraryDoc,
  initPlanDoc,
  openLibraryDoc,
  openPlanDoc,
  seedLibrary,
} from "./schema";

const PLAN_TOP_LEVEL = ["bases", "blocks", "expenses", "meta", "plan"];
const LIBRARY_TOP_LEVEL = ["kinds", "meta", "places", "plan_index"];

const EXPECTED_KINDS = [
  ["stay", "停留", 0, 1],
  ["lodging", "住宿", 1, 2],
  ["transit", "交通", 2, 3],
  ["food", "餐饮", 2, 4],
  ["sight", "游玩", 2, 5],
  ["shopping", "购物", 2, 6],
  ["other", "其他", 2, 7],
] as const;

function topLevelNames(doc: Y.Doc): string[] {
  return [...doc.share.keys()].sort();
}

function errorCodeOf(fn: () => void): string | undefined {
  try {
    fn();
  } catch (error) {
    return error instanceof DocumentError ? error.code : "not-a-document-error";
  }
  return undefined;
}

describe("计划文档初始化", () => {
  test("初始化后的顶层结构", () => {
    const doc = new Y.Doc();
    initPlanDoc(doc, "p1");

    expect(topLevelNames(doc)).toEqual(PLAN_TOP_LEVEL);
    for (const name of PLAN_TOP_LEVEL) {
      expect(doc.share.get(name)).toBeInstanceOf(Y.Map);
    }
    const meta = doc.getMap("meta");
    expect(meta.get("schema")).toBe(2);
    expect(meta.get("plan_id")).toBe("p1");
  });

  test("初始化后的计划默认值", () => {
    const doc = new Y.Doc();
    initPlanDoc(doc, "p1");

    const plan = doc.getMap("plan");
    expect(plan.get("name")).toBe("未命名计划");
    expect(plan.get("traveler_count")).toBe(1);
    expect(plan.get("base_currency")).toBe("CNY");
    expect(plan.has("cost_per_km_cents")).toBe(false);
  });
});

describe("资料库文档初始化", () => {
  test("初始化后的资料库", () => {
    const doc = new Y.Doc();
    initLibraryDoc(doc);

    expect(topLevelNames(doc)).toEqual(LIBRARY_TOP_LEVEL);
    expect(doc.getMap("meta").get("schema")).toBe(2);
    expect(doc.getMap("kinds").size).toBe(7);
  });
});

describe("预设类型的播种", () => {
  test("空资料库播种", () => {
    const doc = new Y.Doc();
    seedLibrary(doc);

    const kinds = doc.getMap<Y.Map<unknown>>("kinds");
    expect([...kinds.keys()].sort()).toEqual(EXPECTED_KINDS.map(([id]) => id).sort());
    for (const [id, name, layer, order] of EXPECTED_KINDS) {
      const kind = kinds.get(id);
      expect(kind?.get("name")).toBe(name);
      expect(kind?.get("layer")).toBe(layer);
      expect(kind?.get("order")).toBe(order);
      expect(kind?.get("builtin")).toBe(true);
      expect(kind?.get("color")).toMatch(/^#[0-9a-f]{6}$/);
    }
    // 状态 2026-09-17 整个去掉了：不再播种
    expect(doc.share.has("statuses")).toBe(false);
  });

  test("重复播种不多出一套", () => {
    const doc = new Y.Doc();
    seedLibrary(doc);
    seedLibrary(doc);

    expect(doc.getMap("kinds").size).toBe(7);
    expect(doc.share.has("statuses")).toBe(false);
  });

  test("播种不覆盖用户改过的预设", () => {
    const doc = new Y.Doc();
    seedLibrary(doc);
    const sight = doc.getMap<Y.Map<unknown>>("kinds").get("sight");
    sight?.set("name", "景点");
    sight?.set("color", "#123456");

    seedLibrary(doc);

    expect(sight?.get("name")).toBe("景点");
    expect(sight?.get("color")).toBe("#123456");
  });

  test("只补缺的", () => {
    const doc = new Y.Doc();
    const kinds = doc.getMap<Y.Map<unknown>>("kinds");
    const stay = new Y.Map<unknown>();
    kinds.set("stay", stay);
    stay.set("name", "在哪");
    stay.set("color", "#000000");
    stay.set("layer", 5);
    stay.set("builtin", true);
    stay.set("order", 9);

    seedLibrary(doc);

    expect(kinds.size).toBe(7);
    expect(kinds.get("stay")?.toJSON()).toEqual({
      name: "在哪",
      color: "#000000",
      layer: 5,
      builtin: true,
      order: 9,
    });
  });
});

describe("打开文档时检查 schema 版本", () => {
  test("版本比代码新", () => {
    const doc = new Y.Doc();
    initPlanDoc(doc, "p1");
    doc.getMap("meta").set("schema", 3);

    expect(errorCodeOf(() => openPlanDoc(doc))).toBe("SCHEMA_TOO_NEW");
  });

  test("没有版本号", () => {
    expect(errorCodeOf(() => openPlanDoc(new Y.Doc()))).toBe("NOT_INITIALIZED");
  });

  test("版本正好", () => {
    const doc = new Y.Doc();
    initLibraryDoc(doc);

    expect(errorCodeOf(() => openLibraryDoc(doc))).toBeUndefined();
  });
});

describe("打开版本 1 的文档时迁移", () => {
  /** 版本 1 的计划文档：两件事，一件待定、一件已确认且勾上了。 */
  function planV1(): Y.Doc {
    const doc = new Y.Doc();
    initPlanDoc(doc, "p1");
    doc.transact(() => {
      doc.getMap("meta").set("schema", 1);
      const blocks = doc.getMap<Y.Map<unknown>>("blocks");
      blocks.set("k1", new Y.Map<unknown>([["title", "西湖"], ["kind_id", "sight"], ["status_id", "pending"]]));
      blocks.set(
        "k2",
        new Y.Map<unknown>([["title", "灵隐寺"], ["kind_id", "sight"], ["status_id", "confirmed"], ["checked", true]]),
      );
    });
    return doc;
  }

  test("计划文档：每件事去掉状态，勾上的照旧，版本写成 2", () => {
    const doc = planV1();

    openPlanDoc(doc);

    const blocks = doc.getMap<Y.Map<unknown>>("blocks");
    expect(blocks.get("k1")?.has("status_id")).toBe(false);
    expect(blocks.get("k2")?.has("status_id")).toBe(false);
    expect(blocks.get("k2")?.get("checked")).toBe(true);
    expect(blocks.get("k1")?.get("title")).toBe("西湖");
    expect(doc.getMap("meta").get("schema")).toBe(2);
  });

  test("迁移不进撤销历史", () => {
    const doc = planV1();
    const undo = createPlanUndoManager(doc);

    openPlanDoc(doc);

    expect(undo.undoStack).toHaveLength(0);
  });

  test("资料库：清空状态，版本写成 2", () => {
    const doc = new Y.Doc();
    initLibraryDoc(doc);
    doc.transact(() => {
      doc.getMap("meta").set("schema", 1);
      const statuses = doc.getMap<Y.Map<unknown>>("statuses");
      statuses.set("pending", new Y.Map<unknown>([["name", "待定"]]));
      statuses.set("s1", new Y.Map<unknown>([["name", "已预订"]]));
    });

    openLibraryDoc(doc);

    expect(doc.getMap("statuses").size).toBe(0);
    expect(doc.getMap("kinds").size).toBe(7);
    expect(doc.getMap("meta").get("schema")).toBe(2);
  });

  test("已经是版本 2 的不动", () => {
    const doc = new Y.Doc();
    initPlanDoc(doc, "p1");
    let transactions = 0;
    doc.on("afterTransaction", () => {
      transactions += 1;
    });

    openPlanDoc(doc);

    expect(transactions).toBe(0);
  });
});
