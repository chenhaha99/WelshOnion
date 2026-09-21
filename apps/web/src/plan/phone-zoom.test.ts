import { describe, expect, it } from "vitest";
import { anchoredScroll, pinchZoom, ZOOM_MAX } from "./phone-zoom";

describe("捏合换算倍数", () => {
  it("两指距离变成几倍，倍数跟着乘", () => {
    expect(pinchZoom(1, 100, 200)).toBe(2);
    expect(pinchZoom(3, 100, 50)).toBe(1.5);
  });

  it("夹在 1 倍到最大倍数之间", () => {
    expect(pinchZoom(1, 100, 50)).toBe(1);
    expect(pinchZoom(4, 100, 400)).toBe(ZOOM_MAX);
  });
});

describe("缩放时两指中间那个钟点不动", () => {
  // 左边钉着 42 像素的「第 N 天」那一列；横轴 1 倍宽 300
  it("放大一倍：中点下面的钟点还在中点下面", () => {
    // 没滚，中点在框里 192 像素处：横轴上第 150 像素（正中）；放大到 600 宽后它在 300，要滚 150
    expect(anchoredScroll({ scrollLeft: 0, focusX: 192, gutter: 42, oldWidth: 300, newWidth: 600 })).toBe(150);
  });

  it("已经滚着：按滚过的算", () => {
    // 滚了 150，中点 192 → 横轴第 300 像素（600 宽里）；缩回 300 宽是第 150 像素，滚 0
    expect(anchoredScroll({ scrollLeft: 150, focusX: 192, gutter: 42, oldWidth: 600, newWidth: 300 })).toBe(0);
  });

  it("不滚到负数", () => {
    expect(anchoredScroll({ scrollLeft: 0, focusX: 60, gutter: 42, oldWidth: 600, newWidth: 300 })).toBe(0);
  });
});
