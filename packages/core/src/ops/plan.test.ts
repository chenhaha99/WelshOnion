import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc } from "../schema";
import { addBase } from "../testing";
import { addBlock, setBlockMark, setBlockTag } from "./blocks";
import { setDays } from "./days";
import { addExpense } from "./expenses";
import { addTag } from "./library";
import { createPlanUndoManager } from "./origin";
import { createPlan, deletePlan, duplicatePlan, renamePlan, setPlanSettings, touchPlan } from "./plan";

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

describe("复制计划", () => {
  const LATER = "2026-09-15T09:00:00.000Z";

  /** 「关西 10 天」：10-01 起 3 天；10-02 上 09:00 起 120 分钟、完成了、带着「必去」的「西湖」挂着 30000 分。 */
  function kansai() {
    const { library, planDoc } = setup({ name: "关西 10 天" });
    const days = setDays(planDoc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
    if (!days.ok) throw new Error("建天失败");
    const [, oct2, oct3] = days.value.baseIds;
    const lake = addBlock(planDoc, library, { baseId: oct2!, kindId: "sight", title: "西湖", minute: 540, duration: 120 });
    if (!lake.ok) throw new Error("建块失败");
    setBlockMark(planDoc, [lake.value.blockId], "done");
    const must = addTag(library, { name: "必去", color: "#c08d68" });
    if (!must.ok) throw new Error("建标签失败");
    setBlockTag(planDoc, library, [lake.value.blockId], must.value.tagId, true);
    addExpense(planDoc, library, { title: "门票", amountCents: 30000, blockIds: [lake.value.blockId] });
    return { library, source: planDoc };
  }

  test("平移到新的出发日期", () => {
    const { library, source } = kansai();
    const target = new Y.Doc();

    const result = duplicatePlan(library, source, target, {
      planId: "p2",
      name: "关西 10 天 副本",
      startDate: "2027-04-29",
      now: LATER,
    });

    expect(result.ok).toBe(true);
    expect(target.getMap("meta").get("plan_id")).toBe("p2");
    const view = readPlan(target, readLibrary(library));
    expect(view.plan.name).toBe("关西 10 天 副本");
    expect(view.bases.map((base) => base.date)).toEqual(["2027-04-29", "2027-04-30", "2027-05-01"]);
    const lake = [...view.blocks.values()].find((block) => block.title === "西湖")!;
    expect(view.bases.find((base) => base.id === lake.start_base_id)?.date).toBe("2027-04-30");
    expect(lake).toMatchObject({ start_minute: 540, duration_min: 120 });
    expect(lake.mark).toBe("decided");
    expect(lake.tags.map((tag) => tag.name)).toEqual(["必去"]);
    expect(target.getMap<Y.Map<unknown>>("blocks").get(lake.id)?.has("status_id")).toBe(false);
    expect([...view.expenses.values()].map((expense) => [expense.amount_cents, expense.block_ids])).toEqual([
      [30000, [lake.id]],
    ]);
    expect(readLibrary(library).planIndex.get("p2")).toEqual({
      plan_id: "p2",
      name: "关西 10 天 副本",
      date_start: "2027-04-29",
      date_end: "2027-05-01",
      day_count: 3,
      traveler_count: 1,
      last_opened_at: LATER,
    });
  });

  test("源计划不变", () => {
    const { library, source } = kansai();
    duplicatePlan(library, source, new Y.Doc(), { planId: "p2", name: "副本", startDate: "2027-04-29", now: LATER });

    const view = readPlan(source, readLibrary(library));
    expect(view.bases.map((base) => base.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect([...view.blocks.values()].find((block) => block.title === "西湖")?.mark).toBe("done");
  });

  test("没有天的计划", () => {
    const { library, planDoc } = setup();
    const target = new Y.Doc();

    expect(duplicatePlan(library, planDoc, target, { planId: "p2", name: "副本", now: LATER }).ok).toBe(true);
    expect(readPlan(target, readLibrary(library)).bases).toEqual([]);
    expect(readLibrary(library).planIndex.get("p2")?.day_count).toBe(0);
  });

  test("日期不合法", () => {
    const { library, source } = kansai();
    const target = new Y.Doc();

    const result = duplicatePlan(library, source, target, {
      planId: "p2",
      name: "副本",
      startDate: "2027-02-30",
      now: LATER,
    });

    expect(result.ok).toBe(false);
    expect(target.getMap("meta").get("plan_id")).toBeUndefined();
    expect(readLibrary(library).planIndex.has("p2")).toBe(false);
  });
});
