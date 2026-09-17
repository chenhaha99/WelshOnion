import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "./read";
import { initLibraryDoc, initPlanDoc } from "./schema";
import { addBase, addBlock } from "./testing";
import { countBlocksUsing } from "./usage";

describe("删除前的使用计数", () => {
  test("数自定义类型", () => {
    const library = new Y.Doc();
    initLibraryDoc(library);
    const planDoc = new Y.Doc();
    initPlanDoc(planDoc, "p1");
    addBase(planDoc, "d1", "2026-10-01");
    addBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60, kind_id: "c-work" });
    addBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60, kind_id: "c-work" });
    addBlock(planDoc, "k3", { start_base_id: "d1", start_minute: 780, duration_min: 60, kind_id: "sight" });

    const plan = readPlan(planDoc, readLibrary(library));

    expect(countBlocksUsing(plan, { kindId: "c-work" })).toBe(2);
  });
});

describe("删除标签前的使用计数", () => {
  test("数挂着它的事", () => {
    const library = new Y.Doc();
    initLibraryDoc(library);
    library.getMap("tags").set("t-must", new Y.Map<unknown>([["name", "必去"], ["color", "#c08d68"], ["order", 1]]));
    const planDoc = new Y.Doc();
    initPlanDoc(planDoc, "p1");
    addBase(planDoc, "d1", "2026-10-01");
    addBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60, tag_ids: ["t-must"] });
    addBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60, tag_ids: [] });
    addBlock(planDoc, "k3", { start_base_id: "d1", start_minute: 780, duration_min: 60 });

    const plan = readPlan(planDoc, readLibrary(library));

    expect(countBlocksUsing(plan, { tagId: "t-must" })).toBe(1);
  });
});
