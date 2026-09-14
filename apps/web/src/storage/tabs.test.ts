import {
  createPlanUndoManager,
  readLibrary,
  readPlan,
  setDayFlag,
  setDays,
  setDayTz,
  setPlanSettings,
} from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openLibrary } from "./library";
import { createPlan, openPlan } from "./plans";
import { releaseAll, track } from "./test-helpers";

const NOW = "2026-09-14T10:00:00.000Z";

afterEach(releaseAll);

async function newPlanId(): Promise<string> {
  const library = await openLibrary();
  const created = await createPlan(library.doc, { now: NOW });
  await created.close();
  await library.close();
  return created.planId;
}

/** 模拟一个标签页：自己打开资料库和这个计划。 */
async function openTab(planId: string) {
  const library = track(await openLibrary());
  const plan = track(await openPlan(library.doc, planId, NOW));
  return { doc: plan.doc, read: () => readPlan(plan.doc, readLibrary(library.doc)) };
}

describe("标签页之间实时同步", () => {
  it("一边改、另一边马上看到", async () => {
    const planId = await newPlanId();
    const a = await openTab(planId);
    const b = await openTab(planId);

    setPlanSettings(a.doc, { traveler_count: 3 });
    await vi.waitFor(() => expect(b.read().plan.traveler_count).toBe(3));
  });

  it("撤销不撤别的标签页的改动", async () => {
    const planId = await newPlanId();
    const a = await openTab(planId);
    const days = setDays(a.doc, { startDate: "2026-10-01", count: 1, tz: "Asia/Shanghai" });
    if (!days.ok) throw new Error("建天失败");
    const dayId = days.value.baseIds[0]!;
    const b = await openTab(planId);
    const undo = createPlanUndoManager(a.doc);

    setDayFlag(a.doc, dayId, "leave");
    setDayTz(b.doc, dayId, "Asia/Tokyo");
    await vi.waitFor(() => expect(a.read().bases[0]?.tz).toBe("Asia/Tokyo"));

    undo.undo();
    expect(a.read().bases[0]?.day_flag).toBeNull();
    expect(a.read().bases[0]?.tz).toBe("Asia/Tokyo");
  });
});
