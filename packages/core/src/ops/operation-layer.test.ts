import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary } from "../read";
import { initLibraryDoc } from "../schema";
import { addBase } from "../testing";
import { insertDayBelow, setDayTz } from "./days";
import { createPlanUndoManager } from "./origin";
import { createPlan, setPlanSettings, touchPlan } from "./plan";

let library: Y.Doc;
let planDoc: Y.Doc;
let undo: Y.UndoManager;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  createPlan(library, planDoc, { planId: "p1", now: "2026-09-14T08:00:00.000Z" });
  addBase(planDoc, "a", "2026-09-24");
  addBase(planDoc, "b", "2026-09-25");
  addBase(planDoc, "c", "2026-09-26");
  undo = createPlanUndoManager(planDoc);
});

function base(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("bases").get(id);
}

function sortedDates(): string[] {
  return [...planDoc.getMap<Y.Map<unknown>>("bases").values()].map((b) => b.get("date") as string).sort();
}

describe("一个操作是一步撤销", () => {
  test("插一天后撤销", () => {
    insertDayBelow(planDoc, "b");
    undo.undo();

    expect(sortedDates()).toEqual(["2026-09-24", "2026-09-25", "2026-09-26"]);
  });

  test("连做两个操作只撤后一个", () => {
    setDayTz(planDoc, "b", "Asia/Tokyo");
    setPlanSettings(planDoc, { traveler_count: 3 });
    undo.undo();

    expect(planDoc.getMap("plan").get("traveler_count")).toBe(1);
    expect(base("b")?.get("tz")).toBe("Asia/Tokyo");
  });
});

describe("只撤自己做过的", () => {
  test("同步过来的改动不被撤销", () => {
    setPlanSettings(planDoc, { traveler_count: 3 });
    planDoc.transact(() => base("b")?.set("tz", "Asia/Tokyo"), "another-peer");
    undo.undo();

    expect(planDoc.getMap("plan").get("traveler_count")).toBe(1);
    expect(base("b")?.get("tz")).toBe("Asia/Tokyo");
  });
});

describe("资料库的写入不进撤销", () => {
  test("打开计划不能被撤销", () => {
    touchPlan(library, planDoc, "2026-09-14T09:00:00.000Z");

    expect(undo.undoStack).toHaveLength(0);
    expect(readLibrary(library).planIndex.get("p1")?.last_opened_at).toBe("2026-09-14T09:00:00.000Z");
  });
});

describe("失败时返回错误，不写任何东西", () => {
  test("字段取值不合法", () => {
    expect(setDayTz(planDoc, "b", "Mars/Base")).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "tz" },
    });
    expect(base("b")?.get("tz")).toBe("Asia/Shanghai");
    expect(undo.undoStack).toHaveLength(0);
  });

  test("要改的底座不存在", () => {
    expect(setDayTz(planDoc, "gone", "Asia/Tokyo")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
  });
});

describe("写 null 就是删掉这个键", () => {
  test("清掉每公里成本", () => {
    setPlanSettings(planDoc, { cost_per_km_cents: 80 });
    setPlanSettings(planDoc, { cost_per_km_cents: null });

    expect(planDoc.getMap("plan").has("cost_per_km_cents")).toBe(false);
  });
});
