import { describe, expect, it } from "vitest";
import { clampLinear, dragResult, previewSegments, splitLinear } from "./timeline-drag";

// 位置都是「线性分钟」：第几行 × 1440 + 这一行第几分钟

describe("松手后块的开始和时长", () => {
  const lake = { start: 540, duration: 180 }; // 第 1 行 09:00 起 3 小时

  it("挪：同一行往右拖 1 小时", () => {
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 660 }, lake)).toEqual({ start: 600, duration: 180 });
  });

  it("挪：吸附到 15 分钟（拖 50 分钟落在 45）", () => {
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 650 }, lake)).toEqual({ start: 585, duration: 180 });
  });

  it("挪：拖到下一行，横向不动", () => {
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 1, minute: 600 }, lake)).toEqual({ start: 1980, duration: 180 });
  });

  it("挪：指针拖出这一行右边，就是过了 24 点", () => {
    const supper = { start: 1320, duration: 60 };
    expect(dragResult("move", { row: 0, minute: 1350 }, { row: 0, minute: 1530 }, supper)).toEqual({
      start: 1500,
      duration: 60,
    });
  });

  it("挪：按跨时区的块的后半段，没动就还在原位，动多少挪多少", () => {
    const flight = { start: 1080, duration: 720 };
    expect(dragResult("move", { row: 1, minute: 600 }, { row: 1, minute: 600 }, flight)).toEqual(flight);
    expect(dragResult("move", { row: 1, minute: 600 }, { row: 1, minute: 630 }, flight)).toEqual({ start: 1110, duration: 720 });
  });

  it("右端：结束跟着指针移动的距离变，开始不动", () => {
    expect(dragResult("end", { row: 0, minute: 718 }, { row: 0, minute: 778 }, lake)).toEqual({ start: 540, duration: 240 });
  });

  it("右端：拖过开始，时长夹在 0", () => {
    expect(dragResult("end", { row: 0, minute: 718 }, { row: 0, minute: 418 }, lake)).toEqual({ start: 540, duration: 0 });
  });

  it("左端：开始跟着指针移动的距离变，结束不动", () => {
    const hengdian = { start: 480, duration: 720 };
    expect(dragResult("start", { row: 0, minute: 482 }, { row: 0, minute: 542 }, hengdian)).toEqual({
      start: 540,
      duration: 660,
    });
  });

  it("左端：拖过结束，夹在结束、时长 0", () => {
    const boat = { start: 600, duration: 60 };
    expect(dragResult("start", { row: 0, minute: 602 }, { row: 0, minute: 722 }, boat)).toEqual({ start: 660, duration: 0 });
  });

  it("左端：结束不在 15 分钟的格子上，也不跟着吸附", () => {
    const odd = { start: 600, duration: 67 }; // 结束 11:07
    expect(dragResult("start", { row: 0, minute: 600 }, { row: 0, minute: 630 }, odd)).toEqual({ start: 630, duration: 37 });
  });
});

describe("线性位置", () => {
  it("拆成第几行第几分钟", () => {
    expect(splitLinear(0)).toEqual({ row: 0, minute: 0 });
    expect(splitLinear(1440)).toEqual({ row: 1, minute: 0 });
    expect(splitLinear(1500)).toEqual({ row: 1, minute: 60 });
  });

  it("夹在计划里：往前出界到第一行 0 分钟，往后出界到最后一行 1439 分钟（和 core 一样）", () => {
    expect(clampLinear(-30, 2)).toEqual(0);
    expect(clampLinear(1500, 2)).toEqual(1500);
    expect(clampLinear(2900, 2)).toEqual(2879);
  });
});

describe("预览框每行一段", () => {
  it("跨午夜切成两段", () => {
    expect(previewSegments(1320, 600, 2)).toEqual([
      { row: 0, from: 1320, to: 1440 },
      { row: 1, from: 0, to: 480 },
    ]);
  });

  it("超出最后一行的截掉", () => {
    expect(previewSegments(1380, 300, 1)).toEqual([{ row: 0, from: 1380, to: 1440 }]);
  });

  it("开始先夹在计划里", () => {
    expect(previewSegments(-30, 60, 2)).toEqual([{ row: 0, from: 0, to: 60 }]);
  });

  it("时长为 0 是一个点", () => {
    expect(previewSegments(720, 0, 1)).toEqual([{ row: 0, from: 720, to: 720 }]);
  });
});
