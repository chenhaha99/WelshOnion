import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { readLibrary } from "../read";
import { initLibraryDoc } from "../schema";
import { addBase } from "../testing";
import { createPlanUndoManager } from "./origin";
import { createPlan, deletePlan, renamePlan, setPlanSettings, touchPlan } from "./plan";

const NOW = "2026-09-14T08:00:00.000Z";

function setup(options: { planId?: string; name?: string; library?: Y.Doc } = {}) {
  const library = options.library ?? new Y.Doc();
  if (!options.library) initLibraryDoc(library);
  const planDoc = new Y.Doc();
  const result = createPlan(library, planDoc, {
    planId: options.planId ?? "p1",
    now: NOW,
    ...(options.name === undefined ? {} : { name: options.name }),
  });
  return { library, planDoc, result };
}

describe("新建计划", () => {
  test("不给名字", () => {
    const { library, planDoc, result } = setup();

    expect(result.ok).toBe(true);
    expect(planDoc.getMap("meta").get("plan_id")).toBe("p1");
    expect(planDoc.getMap("plan").get("name")).toBe("未命名计划");
    expect(readLibrary(library).planIndex.get("p1")).toEqual({
      plan_id: "p1",
      name: "未命名计划",
      date_start: null,
      date_end: null,
      day_count: 0,
      traveler_count: 1,
      last_opened_at: NOW,
    });
  });

  test("给了名字", () => {
    const { library, planDoc } = setup({ name: "关西 10 天" });

    expect(planDoc.getMap("plan").get("name")).toBe("关西 10 天");
    expect(readLibrary(library).planIndex.get("p1")?.name).toBe("关西 10 天");
  });
});

describe("改计划名", () => {
  test("改名", () => {
    const { library, planDoc } = setup();

    expect(renamePlan(library, planDoc, "华东自驾").ok).toBe(true);

    expect(planDoc.getMap("plan").get("name")).toBe("华东自驾");
    expect(readLibrary(library).planIndex.get("p1")?.name).toBe("华东自驾");
  });

  test("撤销改名", () => {
    const { library, planDoc } = setup();
    const undo = createPlanUndoManager(planDoc);

    renamePlan(library, planDoc, "华东自驾");
    undo.undo();

    expect(planDoc.getMap("plan").get("name")).toBe("未命名计划");
    expect(readLibrary(library).planIndex.get("p1")?.name).toBe("华东自驾");
  });
});

describe("改计划设置", () => {
  test("改人数和每公里成本", () => {
    const { planDoc } = setup();

    expect(setPlanSettings(planDoc, { traveler_count: 3, cost_per_km_cents: 80 }).ok).toBe(true);

    expect(planDoc.getMap("plan").get("traveler_count")).toBe(3);
    expect(planDoc.getMap("plan").get("cost_per_km_cents")).toBe(80);
  });

  test("有一项不合法就都不改", () => {
    const { planDoc } = setup();

    const result = setPlanSettings(planDoc, { traveler_count: 0, cost_per_km_cents: 80 });

    expect(result).toEqual({ ok: false, error: { code: "INVALID_FIELD", field: "traveler_count" } });
    expect(planDoc.getMap("plan").get("traveler_count")).toBe(1);
    expect(planDoc.getMap("plan").has("cost_per_km_cents")).toBe(false);
  });

  test("清掉每公里成本", () => {
    const { planDoc } = setup();
    setPlanSettings(planDoc, { cost_per_km_cents: 80 });

    setPlanSettings(planDoc, { cost_per_km_cents: null });

    expect(planDoc.getMap("plan").has("cost_per_km_cents")).toBe(false);
  });
});

describe("打开计划", () => {
  test("打开时刷新摘要", () => {
    const { library, planDoc } = setup();
    addBase(planDoc, "d1", "2026-10-01");
    addBase(planDoc, "d2", "2026-10-02");

    expect(touchPlan(library, planDoc, "2026-09-14T09:00:00.000Z").ok).toBe(true);

    expect(readLibrary(library).planIndex.get("p1")).toMatchObject({
      date_start: "2026-10-01",
      date_end: "2026-10-02",
      day_count: 2,
      last_opened_at: "2026-09-14T09:00:00.000Z",
    });
  });
});

describe("删除计划", () => {
  test("删掉索引", () => {
    const { library } = setup({ planId: "p1" });
    setup({ planId: "p2", library });

    expect(deletePlan(library, "p1").ok).toBe(true);

    expect([...readLibrary(library).planIndex.keys()]).toEqual(["p2"]);
  });
});
