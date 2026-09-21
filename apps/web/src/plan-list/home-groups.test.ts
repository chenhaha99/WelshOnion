import { describe, expect, it } from "vitest";
import { countdownLine, groupPlans, nextPlan } from "./home-groups";

function plan(plan_id: string, date_start: string | null, date_end: string | null) {
  return { plan_id, name: plan_id, date_start, date_end, day_count: 0, traveler_count: 1, last_opened_at: null };
}

// 今天是 9.20
const TODAY = "2026-09-20";

describe("首页按时间分组", () => {
  it("进行中、即将出发（出发日期从近到远）、还没排日期、已结束（结束日期从近到远）", () => {
    const groups = groupPlans(
      [
        plan("东京", "2026-12-24", "2026-12-29"),
        plan("去年", "2025-10-01", "2025-10-03"),
        plan("杭州", "2026-10-01", "2026-10-03"),
        plan("没日期", null, null),
        plan("上周", "2026-09-12", "2026-09-13"),
        plan("正在", "2026-09-19", "2026-09-21"),
      ],
      TODAY,
    );

    expect(groups.ongoing.map((p) => p.plan_id)).toEqual(["正在"]);
    expect(groups.upcoming.map((p) => p.plan_id)).toEqual(["杭州", "东京"]);
    expect(groups.undated.map((p) => p.plan_id)).toEqual(["没日期"]);
    expect(groups.past.map((p) => p.plan_id)).toEqual(["上周", "去年"]);
  });

  it("今天出发、今天结束都算进行中", () => {
    const groups = groupPlans([plan("今天走", "2026-09-20", "2026-09-22"), plan("今天回", "2026-09-18", "2026-09-20")], TODAY);
    expect(groups.ongoing.map((p) => p.plan_id)).toEqual(["今天回", "今天走"]);
  });
});

describe("下一趟", () => {
  it("有进行中的是进行中那个，没有是最近要出发的，都没有是 null", () => {
    expect(nextPlan(groupPlans([plan("杭州", "2026-10-01", "2026-10-03"), plan("正在", "2026-09-19", "2026-09-21")], TODAY))?.plan_id).toBe("正在");
    expect(nextPlan(groupPlans([plan("东京", "2026-12-24", "2026-12-29"), plan("杭州", "2026-10-01", "2026-10-03")], TODAY))?.plan_id).toBe("杭州");
    expect(nextPlan(groupPlans([plan("上周", "2026-09-12", "2026-09-13"), plan("没日期", null, null)], TODAY))).toBeNull();
  });
});

describe("下一趟卡片上那一行", () => {
  it("还没出发：还有几天出发；明天就写明天", () => {
    expect(countdownLine(plan("杭州", "2026-10-01", "2026-10-03"), TODAY)).toBe("还有 11 天出发");
    expect(countdownLine(plan("明天", "2026-09-21", "2026-09-23"), TODAY)).toBe("明天出发");
  });

  it("进行中：第几天、共几天", () => {
    expect(countdownLine({ ...plan("正在", "2026-09-19", "2026-09-21"), day_count: 3 }, TODAY)).toBe("第 2 天，共 3 天");
  });
});
