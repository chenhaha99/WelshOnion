import { afterEach, describe, expect, test, vi } from "vitest";
import { baseStartUtcMs } from "./time";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("这一天 00:00 是哪个绝对时刻", () => {
  test("东八区 10.1 的 00:00 是 UTC 9.30 16:00", () => {
    expect(baseStartUtcMs("2026-10-01", "Asia/Shanghai")).toBe(Date.UTC(2026, 8, 30, 16));
  });

  test("纽约 10.1 还在夏令时：00:00 是 UTC 04:00", () => {
    expect(baseStartUtcMs("2026-10-01", "America/New_York")).toBe(Date.UTC(2026, 9, 1, 4));
  });

  test("同一个日期和时区反复换算，浏览器的时区换算器最多建一次：新建一个要几十微秒，大计划一个画面要换算几万次", () => {
    const created = vi.spyOn(Intl, "DateTimeFormat");

    for (let i = 0; i < 100; i++) baseStartUtcMs("2026-10-02", "Asia/Tokyo");

    expect(created.mock.calls.length).toBeLessThanOrEqual(1);
    expect(baseStartUtcMs("2026-10-02", "Asia/Tokyo")).toBe(Date.UTC(2026, 9, 1, 15));
  });
});
