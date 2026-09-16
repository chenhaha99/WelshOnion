import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import {
  DocumentError,
  initLibraryDoc,
  initPlanDoc,
  openLibraryDoc,
  openPlanDoc,
  seedLibrary,
} from "./schema";

const PLAN_TOP_LEVEL = ["bases", "blocks", "expenses", "meta", "plan"];
const LIBRARY_TOP_LEVEL = ["kinds", "meta", "places", "plan_index", "statuses"];

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
    expect(meta.get("schema")).toBe(1);
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
    expect(doc.getMap("meta").get("schema")).toBe(1);
    expect(doc.getMap("kinds").size).toBe(7);
    expect(doc.getMap("statuses").size).toBe(2);
  });
});

describe("预设类型和状态的播种", () => {
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

    const statuses = doc.getMap<Y.Map<unknown>>("statuses");
    expect([...statuses.keys()].sort()).toEqual(["confirmed", "pending"]);
    expect(statuses.get("pending")?.get("name")).toBe("待定");
    expect(statuses.get("pending")?.get("order")).toBe(1);
    expect(statuses.get("confirmed")?.get("name")).toBe("已确认");
    expect(statuses.get("confirmed")?.get("order")).toBe(2);
    for (const status of statuses.values()) {
      expect(status.get("builtin")).toBe(true);
      expect(status.get("color")).toMatch(/^#[0-9a-f]{6}$/);
      expect(status.has("layer")).toBe(false);
    }
  });

  test("重复播种不多出一套", () => {
    const doc = new Y.Doc();
    seedLibrary(doc);
    seedLibrary(doc);

    expect(doc.getMap("kinds").size).toBe(7);
    expect(doc.getMap("statuses").size).toBe(2);
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
    doc.getMap("meta").set("schema", 2);

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
