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
  it("至少一周后的第一个周五出发：今天 9.14（周一）→ 9.25（周五）", () => {
    expect(sampleStartDate("2026-09-14")).toBe("2026-09-25");
  });

  it("不管今天星期几，都是周五出发、7 到 13 天后：三处的闭馆日都避开（陈家祠周二，南越王墓、省博周一）", () => {
    for (let offset = 0; offset < 7; offset++) {
      const today = new Date(Date.UTC(2026, 8, 21 + offset)).toISOString().slice(0, 10);
      const start = sampleStartDate(today);
      const days = (Date.parse(start) - Date.parse(today)) / 86_400_000;
      expect(new Date(`${start}T00:00:00Z`).getUTCDay(), today).toBe(5);
      expect(days, today).toBeGreaterThanOrEqual(7);
      expect(days, today).toBeLessThanOrEqual(13);
    }
  });

  it("一趟三天的广州，把功能都用上", () => {
    const { library, plan } = freshPlan();
    writeSamplePlan(plan, library, { startDate: "2026-09-21", tz: "Asia/Shanghai" });
    const view = readPlan(plan, readLibrary(library));
    const blocks = [...view.blocks.values()];
    const titled = (title: string) => blocks.find((block) => block.title === title)!;

    expect(view.plan.name).toBe("示例：广州三日游");
    expect(view.plan.traveler_count).toBe(2);
    expect(view.bases.map((base) => base.date)).toEqual(["2026-09-21", "2026-09-22", "2026-09-23"]);
    // 停留铺满三天
    expect(titled("在广州").duration_min).toBe(3 * 1440);
    // 沙面和下午茶重叠：并排
    expect(titled("沙面").start_minute! + titled("沙面").duration_min!).toBeGreaterThan(titled("下午茶").start_minute!);
    // 酒店跨午夜（第 1 晚、第 2 晚各一段）
    const hotels = blocks.filter((block) => block.title === "酒店");
    expect(hotels).toHaveLength(2);
    for (const hotel of hotels) expect(hotel.start_minute! + hotel.duration_min!).toBeGreaterThan(1440);
    // 没排时间的两件
    expect(blocks.filter((block) => block.start_minute === null).map((block) => block.title).sort()).toEqual(["上下九", "买手信"]);
    // 一件待定：夜游看天气
    expect(titled("珠江夜游").mark).toBe("pending");
    // 南越王墓带着备注（周一闭馆、要预约）
    expect(titled("南越王墓").note).toContain("预约");
    // 6 笔开销，一共 1420 元
    expect(view.expenses.size).toBe(6);
    expect([...view.expenses.values()].reduce((sum, expense) => sum + (expense.amount_cents ?? 0), 0)).toBe(142_000);
  });

  it("名字以「示例：」开头的算示例计划（改了名就不算）", () => {
    expect(isSamplePlan({ name: SAMPLE_NAME })).toBe(true);
    expect(isSamplePlan({ name: "我的广州" })).toBe(false);
  });
});
