import { describe, expect, it } from "vitest";
import { monthLayout, shiftMonth, type CalendarPlan } from "./plans-calendar";

function plan(id: string, name: string, start: string | null, end: string | null): CalendarPlan {
  return { plan_id: id, name, date_start: start, date_end: end, day_count: 1, traveler_count: 1 };
}

/** 一周里每一段写成「名字 第几列-第几列 第几道 左平/右平」，看着方便。 */
function segmentTexts(layout: ReturnType<typeof monthLayout>, weekIndex: number): string[] {
  return layout.weeks[weekIndex]!.segments.map(
    (segment) =>
      `${segment.plan.name} ${segment.fromColumn}-${segment.toColumn} 道${segment.lane}` +
      `${segment.continuesBefore ? " 左平" : ""}${segment.continuesAfter ? " 右平" : ""}`,
  );
}

describe("这个月沾边的几周", () => {
  it("一周从周一开始，只画沾边的几周", () => {
    const layout = monthLayout("2026-09", []);

    expect(layout.weeks).toHaveLength(5);
    expect(layout.weeks[0]!.days[0]).toEqual({ date: "2026-08-31", inMonth: false });
    expect(layout.weeks[0]!.days[1]).toEqual({ date: "2026-09-01", inMonth: true });
    expect(layout.weeks[4]!.days[6]).toEqual({ date: "2026-10-04", inMonth: false });
  });

  it("这个月一号正好是周一，最后一天正好是周日", () => {
    // 2027 年 2 月：2.1 是周一，2.28 是周日，正好 4 周
    const layout = monthLayout("2027-02", []);

    expect(layout.weeks).toHaveLength(4);
    expect(layout.weeks[0]!.days[0]!.date).toBe("2027-02-01");
    expect(layout.weeks[3]!.days[6]!.date).toBe("2027-02-28");
  });

  it("翻月：跨年也对", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-09", 1)).toBe("2026-10");
  });
});

describe("计划画成横条", () => {
  it("跨周折成两段：前一段右平，后一段左平", () => {
    const layout = monthLayout("2026-09", [plan("a", "秋游", "2026-09-18", "2026-09-22")]);

    // 第 3 周是 9.14–9.20，第 4 周是 9.21–9.27；列从 1（周一）数到 7（周日）
    expect(segmentTexts(layout, 2)).toEqual(["秋游 5-7 道1 右平"]);
    expect(segmentTexts(layout, 3)).toEqual(["秋游 1-2 道1 左平"]);
  });

  it("同一周里重叠的分道：出发早的在前，一样早的按 id", () => {
    const layout = monthLayout("2026-09", [
      plan("b", "周末露营", "2026-09-19", "2026-09-20"),
      plan("a", "秋游", "2026-09-18", "2026-09-22"),
      plan("c", "看展", "2026-09-19", "2026-09-19"),
    ]);

    expect(segmentTexts(layout, 2)).toEqual(["秋游 5-7 道1 右平", "周末露营 6-7 道2", "看展 6-6 道3"]);
  });

  it("不重叠的放同一道；道按周分，不跨周对齐", () => {
    const layout = monthLayout("2026-09", [
      plan("a", "秋游", "2026-09-18", "2026-09-22"),
      plan("b", "周末露营", "2026-09-19", "2026-09-20"),
      plan("c", "短途", "2026-09-24", "2026-09-25"),
    ]);

    // 第 4 周只有秋游（周一、周二）和短途（周四、周五），不重叠：都在第 1 道
    expect(segmentTexts(layout, 3)).toEqual(["秋游 1-2 道1 左平", "短途 4-5 道1"]);
    expect(layout.weeks[3]!.laneCount).toBe(1);
    expect(layout.weeks[2]!.laneCount).toBe(2);
  });

  it("沾边的下个月也画", () => {
    const layout = monthLayout("2026-09", [plan("a", "国庆杭州", "2026-10-01", "2026-10-05")]);

    expect(segmentTexts(layout, 4)).toEqual(["国庆杭州 4-7 道1 右平"]);
  });

  it("整个在这个月外面的不画；没排日期的不画但列出来", () => {
    const layout = monthLayout("2026-09", [
      plan("a", "春游", "2026-04-01", "2026-04-03"),
      plan("b", "以后再说", null, null),
    ]);

    expect(layout.weeks.flatMap((week) => week.segments)).toEqual([]);
    expect(layout.undated.map((item) => item.name)).toEqual(["以后再说"]);
  });
});
