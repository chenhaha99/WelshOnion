import { describe, expect, it } from "vitest";
import { planSummaryLine } from "./format";

describe("卡片上的「日期范围 · 天数 · 人数」", () => {
  it("今年的计划", () => {
    const line = planSummaryLine(
      { date_start: "2026-09-24", date_end: "2026-10-02", day_count: 9, traveler_count: 3 },
      2026,
    );
    expect(line).toBe("9.24 – 10.2 · 9 天 · 3 人");
  });

  it("跨年的计划：结束日期加年份", () => {
    const line = planSummaryLine(
      { date_start: "2026-12-30", date_end: "2027-01-03", day_count: 5, traveler_count: 2 },
      2026,
    );
    expect(line).toBe("12.30 – 2027.1.3 · 5 天 · 2 人");
  });

  it("往年的计划：开始日期加年份", () => {
    const line = planSummaryLine(
      { date_start: "2025-09-24", date_end: "2025-10-02", day_count: 9, traveler_count: 3 },
      2026,
    );
    expect(line).toBe("2025.9.24 – 10.2 · 9 天 · 3 人");
  });

  it("只有一天", () => {
    const line = planSummaryLine(
      { date_start: "2026-09-24", date_end: "2026-09-24", day_count: 1, traveler_count: 1 },
      2026,
    );
    expect(line).toBe("9.24 · 1 天 · 1 人");
  });

  it("还没排日期", () => {
    const line = planSummaryLine({ date_start: null, date_end: null, day_count: 0, traveler_count: 1 }, 2026);
    expect(line).toBe("还没排日期 · 1 人");
  });
});
