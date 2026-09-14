import { describe, expect, it } from "vitest";
import { blockTimeLabel, clockOnDay, durationLabel } from "./block-time";

const OCT1 = "2026-10-01";

describe("某天的时刻", () => {
  it("当天写时:分", () => {
    expect(clockOnDay(0, OCT1)).toBe("00:00");
    expect(clockOnDay(1140, OCT1)).toBe("19:00");
  });

  it("落在后面的日期：写上月.日", () => {
    expect(clockOnDay(1500, OCT1)).toBe("10.2 01:00");
    expect(clockOnDay(3120, OCT1)).toBe("10.3 04:00");
    expect(clockOnDay(1500, "2026-09-30")).toBe("10.1 01:00");
  });

  it("正好半夜 0 点：写成当天 24:00", () => {
    expect(clockOnDay(1440, OCT1)).toBe("24:00");
  });
});

describe("时长写法", () => {
  it("不到 1 小时写分钟，否则写小时，最多一位小数", () => {
    expect(durationLabel(45)).toBe("45 分钟");
    expect(durationLabel(180)).toBe("3 小时");
    expect(durationLabel(90)).toBe("1.5 小时");
    expect(durationLabel(1200)).toBe("20 小时");
  });
});

describe("时间格的写法", () => {
  it("有时间：开始–结束", () => {
    expect(blockTimeLabel({ start_minute: 480, duration_min: 60, slot: null }, OCT1)).toBe("08:00–09:00");
  });

  it("结束落在后面的日期：写上月.日", () => {
    expect(blockTimeLabel({ start_minute: 1320, duration_min: 600, slot: null }, OCT1)).toBe("22:00–10.2 08:00");
  });

  it("结束正好是半夜 0 点：写成当天 24:00", () => {
    expect(blockTimeLabel({ start_minute: 1380, duration_min: 60, slot: null }, OCT1)).toBe("23:00–24:00");
  });

  it("时长为 0：只写开始时刻", () => {
    expect(blockTimeLabel({ start_minute: 1200, duration_min: 0, slot: null }, OCT1)).toBe("20:00");
  });

  it("没排时间：写格子名，没分格就是整天", () => {
    expect(blockTimeLabel({ start_minute: null, duration_min: null, slot: null }, OCT1)).toBe("整天");
    expect(blockTimeLabel({ start_minute: null, duration_min: null, slot: "afternoon" }, OCT1)).toBe("下午");
    expect(blockTimeLabel({ start_minute: null, duration_min: null, slot: "evening" }, OCT1)).toBe("晚上");
  });

  it("没排时间但填了时长：格子名后面写上时长，时长 0 不写", () => {
    expect(blockTimeLabel({ start_minute: null, duration_min: 90, slot: "morning" }, OCT1)).toBe("上午 · 1.5 小时");
    expect(blockTimeLabel({ start_minute: null, duration_min: 120, slot: null }, OCT1)).toBe("整天 · 2 小时");
    expect(blockTimeLabel({ start_minute: null, duration_min: 45, slot: null }, OCT1)).toBe("整天 · 45 分钟");
    expect(blockTimeLabel({ start_minute: null, duration_min: 0, slot: null }, OCT1)).toBe("整天");
  });
});
