import { describe, expect, it } from "vitest";
import { initialDayIndex, scrollMinute } from "./timeline-day";
import type { PlacedSegment, RowLayout } from "./timeline-layout";

const threeDays = [{ date: "2026-10-01" }, { date: "2026-10-02" }, { date: "2026-10-03" }];

describe("打开时落在哪一天", () => {
  it("行程进行中：就是今天", () => {
    expect(initialDayIndex(threeDays, "2026-10-02")).toBe(1);
  });

  it("还没出发：第一天", () => {
    expect(initialDayIndex(threeDays, "2026-09-28")).toBe(0);
  });

  it("已经结束：最后一天", () => {
    expect(initialDayIndex(threeDays, "2026-10-05")).toBe(2);
  });

  it("今天那一天被删了：今天之后最近的一天", () => {
    expect(initialDayIndex([{ date: "2026-10-01" }, { date: "2026-10-03" }], "2026-10-02")).toBe(1);
  });

  it("出境当天同一个日期两行：落在第一行", () => {
    const withTwoZones = [{ date: "2026-10-01" }, { date: "2026-10-01" }, { date: "2026-10-02" }];
    expect(initialDayIndex(withTwoZones, "2026-10-01")).toBe(0);
    expect(initialDayIndex(withTwoZones, "2026-10-02")).toBe(2);
  });
});

function placed(blockId: string, from: number, to: number, track: PlacedSegment["track"] = "main"): PlacedSegment {
  return { blockId, row: 0, from, to, continuesBefore: false, continuesAfter: false, track, lane: 1, depth: 0 };
}

function rowWith(segments: PlacedSegment[]): RowLayout {
  const background = segments.filter((segment) => segment.track === "background");
  const main = segments.filter((segment) => segment.track === "main");
  return { background, main, backgroundCount: background.length, laneCount: 1 };
}

describe("打开时滚到哪（最上面是这天第几分钟）", () => {
  it("看今天：现在的钟点往前 1 小时", () => {
    expect(scrollMinute(rowWith([placed("西湖", 540, 720)]), true, 14 * 60 + 20)).toBe(13 * 60 + 20);
  });

  it("看今天、刚过零点：不早于 0 点", () => {
    expect(scrollMinute(rowWith([]), true, 30)).toBe(0);
  });

  it("不是今天：主轨上最早开始的事往前 30 分钟", () => {
    expect(scrollMinute(rowWith([placed("午饭", 720, 780), placed("西湖", 540, 720)]), false, 0)).toBe(510);
  });

  it("背景条不算：停留从 0 点开始也不滚到 0 点", () => {
    expect(scrollMinute(rowWith([placed("在杭州", 0, 1440, "background"), placed("游船", 600, 660)]), false, 0)).toBe(570);
  });

  it("主轨上没有排上时间的事：08:00", () => {
    expect(scrollMinute(rowWith([placed("在杭州", 0, 1440, "background")]), false, 0)).toBe(480);
  });

  it("最早的事在凌晨：不早于 0 点", () => {
    expect(scrollMinute(rowWith([placed("早班车", 10, 70)]), false, 0)).toBe(0);
  });
});
