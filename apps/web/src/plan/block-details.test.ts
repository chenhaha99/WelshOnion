import { describe, expect, it } from "vitest";
import { distanceKmText, parseDistanceKm } from "./block-details";

describe("距离", () => {
  it("按公里填，最多一位小数，存成米；空着就是不写", () => {
    expect(parseDistanceKm("32")).toEqual({ ok: true, value: 32000 });
    expect(parseDistanceKm("32.5")).toEqual({ ok: true, value: 32500 });
    expect(parseDistanceKm("0.8")).toEqual({ ok: true, value: 800 });
    expect(parseDistanceKm("0")).toEqual({ ok: true, value: 0 });
    expect(parseDistanceKm("")).toEqual({ ok: true, value: null });
  });

  it("不合法", () => {
    for (const text of ["32.55", "-1", "三十", "1e3"]) {
      expect(parseDistanceKm(text)).toEqual({ ok: false });
    }
  });

  it("显示时换回公里", () => {
    expect(distanceKmText(32000)).toBe("32");
    expect(distanceKmText(32500)).toBe("32.5");
    expect(distanceKmText(800)).toBe("0.8");
  });
});
