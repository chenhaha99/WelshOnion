import { createPlan, initLibraryDoc, readLibrary, readPlan, seedLibrary } from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { isSamplePlan, SAMPLE_NAME, sampleStartDate, writeSamplePlan } from "./sample-plan";

function freshPlan() {
  const library = new Y.Doc();
  initLibraryDoc(library);
  seedLibrary(library);
  const plan = new Y.Doc();
  createPlan(library, plan, { planId: "p1", name: "x", now: "2026-09-14T10:00:00.000Z" });
  return { library, plan };
}

describe("示例计划", () => {
  it("从下周开始：今天 9.14 → 9.21", () => {
    expect(sampleStartDate("2026-09-14")).toBe("2026-09-21");
  });

  it("一趟三天的杭州，把功能都用上", () => {
    const { library, plan } = freshPlan();
    writeSamplePlan(plan, library, { startDate: "2026-09-21", tz: "Asia/Shanghai" });
    const view = readPlan(plan, readLibrary(library));
    const blocks = [...view.blocks.values()];
    const titled = (title: string) => blocks.find((block) => block.title === title)!;

    expect(view.plan.name).toBe(SAMPLE_NAME);
    expect(view.plan.traveler_count).toBe(2);
    expect(view.bases.map((base) => base.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    // 停留铺满三天
    expect(titled("在杭州").duration_min).toBe(3 * 1440);
    // 西湖和午饭重叠：并排
    expect(titled("西湖").start_minute! + titled("西湖").duration_min!).toBeGreaterThan(titled("午饭").start_minute!);
    // 酒店跨午夜
    expect(titled("湖边民宿").start_minute! + titled("湖边民宿").duration_min!).toBeGreaterThan(1440);
    // 没排时间的两件
    expect(blocks.filter((block) => block.start_minute === null).map((block) => block.title).sort()).toEqual(["买伴手礼", "河坊街"]);
    // 一件待定
    expect(titled("千岛湖一日游").mark).toBe("pending");
    // 挂了几笔开销
    expect(view.expenses.size).toBeGreaterThanOrEqual(4);
  });

  it("名字以「示例：」开头的算示例计划（改了名就不算）", () => {
    expect(isSamplePlan({ name: SAMPLE_NAME })).toBe(true);
    expect(isSamplePlan({ name: "我的杭州" })).toBe(false);
  });
});
