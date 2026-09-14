import { describe, expect, it } from "vitest";
import {
  budgetFieldText,
  budgetParts,
  hoursText,
  parseClockText,
  parseHours,
  parseKm,
  withBudgetField,
} from "./day-budget";

describe("几点起、几点收工", () => {
  it("认 8:00 和 08:00，存成 08:00；空着就是不设", () => {
    expect(parseClockText("8:00")).toEqual({ ok: true, value: "08:00" });
    expect(parseClockText("08:00")).toEqual({ ok: true, value: "08:00" });
    expect(parseClockText("23:59")).toEqual({ ok: true, value: "23:59" });
    expect(parseClockText("")).toEqual({ ok: true, value: null });
  });

  it("不是 00:00 到 23:59 之间的时刻", () => {
    for (const text of ["25:00", "24:00", "8:5", "8", "08:60", "早上"]) {
      expect(parseClockText(text)).toEqual({ ok: false });
    }
  });
});

describe("最多开多久", () => {
  it("按小时填，最多两位小数，存成分钟", () => {
    expect(parseHours("4.5")).toEqual({ ok: true, value: 270 });
    expect(parseHours("4.25")).toEqual({ ok: true, value: 255 });
    expect(parseHours("0")).toEqual({ ok: true, value: 0 });
    expect(parseHours("")).toEqual({ ok: true, value: null });
  });

  it("不合法", () => {
    for (const text of ["4.255", "-1", "四", "1e2"]) {
      expect(parseHours(text)).toEqual({ ok: false });
    }
  });

  it("显示时换回小时", () => {
    expect(hoursText(270)).toBe("4.5");
    expect(hoursText(255)).toBe("4.25");
    expect(hoursText(240)).toBe("4");
  });
});

describe("最多开多远", () => {
  it("不小于 0 的整数公里", () => {
    expect(parseKm("300")).toEqual({ ok: true, value: 300 });
    expect(parseKm("0")).toEqual({ ok: true, value: 0 });
    expect(parseKm("")).toEqual({ ok: true, value: null });
    for (const text of ["2.5", "-1", "三百"]) {
      expect(parseKm(text)).toEqual({ ok: false });
    }
  });
});

describe("改一项", () => {
  it("加、改、清空；四项都没了是 null", () => {
    const start = withBudgetField(null, "start", "08:00");
    expect(start).toEqual({ start: "08:00" });
    const both = withBudgetField(start, "end", "22:00");
    expect(both).toEqual({ start: "08:00", end: "22:00" });
    expect(withBudgetField(both, "end", "21:00")).toEqual({ start: "08:00", end: "21:00" });
    expect(withBudgetField(both, "end", null)).toEqual({ start: "08:00" });
    expect(withBudgetField({ start: "08:00" }, "start", null)).toBeNull();
  });
});

describe("你设的", () => {
  it("按起、收工、开多久、开多远排，没设的不写", () => {
    expect(budgetParts({ max_drive_km: 300, start: "08:00", end: "22:00", max_drive_min: 270 })).toEqual([
      "08:00 起",
      "22:00 收工",
      "最多开 4.5 小时",
      "最多开 300 公里",
    ]);
    expect(budgetParts({ max_drive_min: 240 })).toEqual(["最多开 4 小时"]);
  });

  it("栏里显示的字：没设是空的", () => {
    const budget = { start: "08:00", max_drive_min: 270, max_drive_km: 300 };
    expect(budgetFieldText(budget, "start")).toBe("08:00");
    expect(budgetFieldText(budget, "end")).toBe("");
    expect(budgetFieldText(budget, "max_drive_min")).toBe("4.5");
    expect(budgetFieldText(budget, "max_drive_km")).toBe("300");
    expect(budgetFieldText(null, "start")).toBe("");
  });
});
