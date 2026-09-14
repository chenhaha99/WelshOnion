import { describe, expect, it } from "vitest";
import { cityName, dayRowLabels, normalizeSystemTimeZone } from "./day-labels";

describe("日期列表每行的标签", () => {
  it("全程一个时区：不出现时区字眼", () => {
    const labels = dayRowLabels([
      { date: "2026-10-01", tz: "Asia/Shanghai" },
      { date: "2026-10-02", tz: "Asia/Shanghai" },
    ]);
    expect(labels).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五"]);
  });

  it("出境当天：同一日期同一个「第几天」，和第一天时区不同的写小时差", () => {
    const labels = dayRowLabels([
      { date: "2026-10-01", tz: "Asia/Shanghai" },
      { date: "2026-10-02", tz: "Asia/Shanghai" },
      { date: "2026-10-02", tz: "Asia/Tokyo" },
      { date: "2026-10-03", tz: "Asia/Tokyo" },
    ]);
    expect(labels).toEqual([
      "第 1 天 · 10.1 周四 · 北京",
      "第 2 天 · 10.2 周五 · 北京",
      "第 2 天 · 10.2 周五 · 东京 +1h",
      "第 3 天 · 10.3 周六 · 东京 +1h",
    ]);
  });

  it("往西飞：小时差是负的", () => {
    const labels = dayRowLabels([
      { date: "2026-10-01", tz: "Asia/Shanghai" },
      { date: "2026-10-01", tz: "America/Los_Angeles" },
    ]);
    expect(labels[1]).toBe("第 1 天 · 10.1 周四 · 洛杉矶 −15h");
  });

  it("表里没有的时区显示 IANA 名；半小时差写成小数", () => {
    const labels = dayRowLabels([
      { date: "2026-10-01", tz: "Asia/Shanghai" },
      { date: "2026-10-02", tz: "Asia/Kolkata" },
    ]);
    expect(labels[1]).toBe("第 2 天 · 10.2 周五 · Asia/Kolkata −2.5h");
  });
});

describe("只有偏移的时区名", () => {
  it("Etc/GMT-9 显示成 UTC+9（Etc 名字里的正负号和习惯相反）", () => {
    expect(cityName("Etc/GMT-9")).toBe("UTC+9");
    expect(cityName("Etc/GMT+5")).toBe("UTC−5");
  });

  it("系统报的东八区 Etc/GMT-8 按北京处理，其他照旧", () => {
    expect(normalizeSystemTimeZone("Etc/GMT-8")).toBe("Asia/Shanghai");
    expect(normalizeSystemTimeZone("Asia/Tokyo")).toBe("Asia/Tokyo");
  });
});
