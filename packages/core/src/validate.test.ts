import { expect, test } from "vitest";
import { validateField } from "./validate";

const OK = { ok: true };

test("分钟数边界", () => {
  expect(validateField("start_minute", 1439)).toEqual(OK);
  expect(validateField("start_minute", 1440)).toEqual({ ok: false, field: "start_minute" });
  expect(validateField("start_minute", null)).toEqual(OK);
});

test("零时长和小数", () => {
  expect(validateField("duration_min", 0)).toEqual(OK);
  expect(validateField("duration_min", -1)).toEqual({ ok: false, field: "duration_min" });
  expect(validateField("duration_min", 1.5)).toEqual({ ok: false, field: "duration_min" });
});

test("金额必须是整数分", () => {
  expect(validateField("amount_cents", 350)).toEqual(OK);
  expect(validateField("amount_cents", 3.5)).toEqual({ ok: false, field: "amount_cents" });
});

test("枚举值", () => {
  expect(validateField("slot", "noon")).toEqual({ ok: false, field: "slot" });
  expect(validateField("transport_mode", "fly")).toEqual({ ok: false, field: "transport_mode" });
});

test("日期和时区", () => {
  expect(validateField("date", "2026-02-30")).toEqual({ ok: false, field: "date" });
  expect(validateField("date", "2026-10-01")).toEqual(OK);
  expect(validateField("tz", "Asia/Tokyo")).toEqual(OK);
  expect(validateField("tz", "Mars/Base")).toEqual({ ok: false, field: "tz" });
});

test("不管字段之间合不合理", () => {
  // 块已有 start_minute = 1380；时长写成 2000 分钟，跨到后面几天是合法的
  expect(validateField("start_minute", 1380)).toEqual(OK);
  expect(validateField("duration_min", 2000)).toEqual(OK);
});

test("时间预算的形状", () => {
  const full = { start: "08:00", end: "22:00", max_drive_min: 240, max_drive_km: 300 };
  expect(validateField("day_budget", full)).toEqual(OK);
  expect(validateField("day_budget", { max_drive_km: 300 })).toEqual(OK);
  expect(validateField("day_budget", null)).toEqual(OK);
  for (const bad of [{ start: "25:00" }, { max_drive_km: -1 }, { speed: 80 }]) {
    expect(validateField("day_budget", bad)).toEqual({ ok: false, field: "day_budget" });
  }
});
