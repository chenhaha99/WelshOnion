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
