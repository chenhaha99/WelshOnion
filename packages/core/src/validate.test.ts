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

test("颜色和坐标", () => {
  expect(validateField("color", "#5b7fa6")).toEqual(OK);
  expect(validateField("color", "blue")).toEqual({ ok: false, field: "color" });
  expect(validateField("lat", 30.8677)).toEqual(OK);
  expect(validateField("lat", 91)).toEqual({ ok: false, field: "lat" });
  expect(validateField("lng", 120.4269)).toEqual(OK);
  expect(validateField("lng", -181)).toEqual({ ok: false, field: "lng" });
});
