import { initLibraryDoc, initPlanDoc, readLibrary, readPlan, setPlanSettings } from "@welshonion/core";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import { connectTabs } from "./tab-sync";

describe("接上标签页同步", () => {
  it("接上同步之前的改动互相补齐", async () => {
    const library = new Y.Doc();
    initLibraryDoc(library);
    const settingsOf = (doc: Y.Doc) => readPlan(doc, readLibrary(library)).plan;

    // A、B 是同一个计划：B 从 A 那里拿到过一份
    const a = new Y.Doc();
    initPlanDoc(a, "p");
    const b = new Y.Doc();
    Y.applyUpdate(b, Y.encodeStateAsUpdate(a));

    const disconnectA = connectTabs(a, "tab-sync-test");
    setPlanSettings(a, { traveler_count: 3 });
    setPlanSettings(b, { cost_per_km_cents: 150 });
    const disconnectB = connectTabs(b, "tab-sync-test");
    try {
      await vi.waitFor(() => {
        expect(settingsOf(a)).toMatchObject({ traveler_count: 3, cost_per_km_cents: 150 });
        expect(settingsOf(b)).toMatchObject({ traveler_count: 3, cost_per_km_cents: 150 });
      });
    } finally {
      disconnectA();
      disconnectB();
    }
  });
});
