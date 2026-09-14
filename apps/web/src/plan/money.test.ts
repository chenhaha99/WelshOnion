import { describe, expect, it } from "vitest";
import { formatYuan, parseYuan } from "./money";

describe("金额写法", () => {
  it("整元不带小数，有角分写两位，千位加逗号", () => {
    expect(formatYuan(30000)).toBe("¥300");
    expect(formatYuan(3850)).toBe("¥38.50");
    expect(formatYuan(120000)).toBe("¥1,200");
    expect(formatYuan(0)).toBe("¥0");
  });
});

describe("金额框解析（按元填，存成分）", () => {
  it("空着就是没填", () => {
    expect(parseYuan("")).toEqual({ ok: true, cents: null });
  });

  it("整数和最多两位小数", () => {
    expect(parseYuan("300")).toEqual({ ok: true, cents: 30000 });
    expect(parseYuan("12.5")).toEqual({ ok: true, cents: 1250 });
    expect(parseYuan("0.8")).toEqual({ ok: true, cents: 80 });
  });

  it("三位小数、负数、不是数都不合法", () => {
    expect(parseYuan("12.345")).toEqual({ ok: false });
    expect(parseYuan("-3")).toEqual({ ok: false });
    expect(parseYuan("三百")).toEqual({ ok: false });
  });
});
