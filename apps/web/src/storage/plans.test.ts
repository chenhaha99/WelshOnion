import {
  createPlan as writePlanDocs,
  initPlanDoc,
  readLibrary,
  readPlan,
  setDays,
  setPlanSettings,
} from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { openLibrary } from "./library";
import { planDbName } from "./names";
import { createPlan, deletePlan, duplicatePlan, openPlan, reconcilePlans } from "./plans";
import { releaseAll, storeDoc, storedDbNames, track } from "./test-helpers";

const NOW = "2026-09-14T10:00:00.000Z";

afterEach(releaseAll);

describe("新建计划", () => {
  it("新建后能再打开", async () => {
    const library = track(await openLibrary());
    const created = await createPlan(library.doc, { name: "关西 10 天", now: NOW });
    await created.close();

    const opened = track(await openPlan(library.doc, created.planId, NOW));
    expect(readPlan(opened.doc, readLibrary(library.doc)).plan.name).toBe("关西 10 天");
    expect(readLibrary(library.doc).planIndex.has(created.planId)).toBe(true);
  });
});

describe("打开计划", () => {
  it("记下打开时间", async () => {
    const library = track(await openLibrary());
    const created = await createPlan(library.doc, { now: "2026-09-13T08:00:00.000Z" });
    await created.close();

    track(await openPlan(library.doc, created.planId, NOW));
    expect(readLibrary(library.doc).planIndex.get(created.planId)?.last_opened_at).toBe(NOW);
  });

  it("计划不存在：打开失败，也不留下空文档", async () => {
    const library = track(await openLibrary());

    await expect(openPlan(library.doc, "nope", NOW)).rejects.toMatchObject({ code: "NOT_INITIALIZED" });
    expect(await storedDbNames()).not.toContain(planDbName("nope"));
  });
});

describe("改动马上存进本机", () => {
  it("不关也存下了", async () => {
    const libraryA = track(await openLibrary());
    const a = track(await createPlan(libraryA.doc, { now: NOW }));
    setPlanSettings(a.doc, { traveler_count: 3 });

    const libraryB = track(await openLibrary());
    const b = track(await openPlan(libraryB.doc, a.planId, NOW));
    expect(readPlan(b.doc, readLibrary(libraryB.doc)).plan.traveler_count).toBe(3);
  });
});

describe("删除计划", () => {
  it("删干净", async () => {
    const library = track(await openLibrary());
    const created = await createPlan(library.doc, { now: NOW });
    await created.close();

    const result = await deletePlan(library.doc, created.planId);
    expect(result.ok).toBe(true);
    expect(await storedDbNames()).not.toContain(planDbName(created.planId));
    expect(readLibrary(library.doc).planIndex.has(created.planId)).toBe(false);
  });

  it("别的标签页开着也删得掉", async () => {
    const libraryA = track(await openLibrary());
    const created = await createPlan(libraryA.doc, { now: NOW });
    await created.close();
    const libraryB = track(await openLibrary());
    track(await openPlan(libraryB.doc, created.planId, NOW));

    const result = await deletePlan(libraryA.doc, created.planId);
    expect(result.ok).toBe(true);
    expect(await storedDbNames()).not.toContain(planDbName(created.planId));
    expect(readLibrary(libraryA.doc).planIndex.has(created.planId)).toBe(false);
  });
});

describe("计划索引对账", () => {
  it("两边各修一条", async () => {
    const library = track(await openLibrary());
    await storeDoc(planDbName("p"), (doc) => initPlanDoc(doc, "p"));
    // 只写了索引，计划文档没存进本机
    writePlanDocs(library.doc, new Y.Doc(), { planId: "q", now: NOW });

    await reconcilePlans(library.doc, NOW);
    const index = readLibrary(library.doc).planIndex;
    expect(index.has("p")).toBe(true);
    expect(index.has("q")).toBe(false);
  });

  it("没初始化的文档不补进索引，也不删", async () => {
    const library = track(await openLibrary());
    await storeDoc(planDbName("e"), () => {});

    await reconcilePlans(library.doc, NOW);
    expect(readLibrary(library.doc).planIndex.has("e")).toBe(false);
    expect(await storedDbNames()).toContain(planDbName("e"));
  });
});

describe("复制计划", () => {
  it("复制后能再打开", async () => {
    const library = track(await openLibrary());
    const source = await createPlan(library.doc, { name: "关西 10 天", now: NOW });
    setDays(source.doc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
    await source.close();

    const copy = await duplicatePlan(library.doc, source.planId, {
      name: "关西 10 天 副本",
      startDate: "2027-04-29",
      now: NOW,
    });
    await copy.close();

    const opened = track(await openPlan(library.doc, copy.planId, NOW));
    const view = readPlan(opened.doc, readLibrary(library.doc));
    expect(view.plan.name).toBe("关西 10 天 副本");
    expect(view.bases[0]?.date).toBe("2027-04-29");
    expect([...readLibrary(library.doc).planIndex.keys()].sort()).toEqual([source.planId, copy.planId].sort());
  });

  it("源计划不存在：失败，也不多出计划文档", async () => {
    const library = track(await openLibrary());
    const before = await storedDbNames();

    await expect(duplicatePlan(library.doc, "nope", { name: "副本", now: NOW })).rejects.toMatchObject({
      code: "NOT_INITIALIZED",
    });
    expect(await storedDbNames()).toEqual(before);
  });
});
