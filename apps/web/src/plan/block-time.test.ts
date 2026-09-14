import { describe, expect, it } from "vitest";
import { blockTimeLabel } from "./block-time";

const OCT1 = "2026-10-01";

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
    expect(blockTimeLabel({ start_minute: null, duration_min: 90, slot: "morning" }, OCT1)).toBe("上午");
    expect(blockTimeLabel({ start_minute: null, duration_min: null, slot: "afternoon" }, OCT1)).toBe("下午");
    expect(blockTimeLabel({ start_minute: null, duration_min: null, slot: "evening" }, OCT1)).toBe("晚上");
  });
});
