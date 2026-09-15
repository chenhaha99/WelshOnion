import { describe, expect, it } from "vitest";
import {
  clampLinear,
  clampToDay,
  dragLabelPlace,
  dragResult,
  edgeScrollStep,
  slotOfMinute,
  splitLinear,
  undatedStartMinute,
} from "./timeline-drag";

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


describe("开始时刻换算成格子", () => {
  it("00:00–05:59 整天，06:00 起上午，12:00 起下午，18:00 起晚上", () => {
    expect([0, 359, 360, 719, 720, 1079, 1080, 1439].map(slotOfMinute)).toEqual([
      "day",
      "day",
      "morning",
      "morning",
      "afternoon",
      "afternoon",
      "evening",
      "evening",
    ]);
  });
});

describe("从栏里拖出来的开始时刻", () => {
  it("吸附到 15 分钟", () => {
    expect(undatedStartMinute(847)).toBe(840);
    expect(undatedStartMinute(853)).toBe(855);
  });

  it("最早 00:00，最晚 23:45", () => {
    expect(undatedStartMinute(-20)).toBe(0);
    expect(undatedStartMinute(1439)).toBe(1425);
    expect(undatedStartMinute(1500)).toBe(1425);
  });
});

describe("竖排里夹在块开始的那一天", () => {
  it("开始最早 00:00，最晚 23:45", () => {
    expect(clampToDay(-60, 0)).toBe(0);
    expect(clampToDay(600, 0)).toBe(600);
    expect(clampToDay(1440, 0)).toBe(1425);
  });

  it("第 2 行的块按第 2 行算", () => {
    expect(clampToDay(1380, 1)).toBe(1440);
    expect(clampToDay(2000, 1)).toBe(2000);
    expect(clampToDay(2880, 1)).toBe(2865);
  });
});

describe("框边自己滚", () => {
  // 框露在屏幕里的部分：纵坐标 100 到 548
  it("离两边都超过 40 像素不滚", () => {
    expect(edgeScrollStep(300, 100, 548)).toBe(0);
    expect(edgeScrollStep(140, 100, 548)).toBe(0);
    expect(edgeScrollStep(508, 100, 548)).toBe(0);
  });

  it("离上边 40 像素以内往上滚，越靠边越快，至少 1 像素", () => {
    expect(edgeScrollStep(139, 100, 548)).toBe(-1);
    expect(edgeScrollStep(120, 100, 548)).toBe(-5);
    expect(edgeScrollStep(100, 100, 548)).toBe(-10);
  });

  it("离下边 40 像素以内往下滚", () => {
    expect(edgeScrollStep(509, 100, 548)).toBe(1);
    expect(edgeScrollStep(528, 100, 548)).toBe(5);
    expect(edgeScrollStep(548, 100, 548)).toBe(10);
  });

  it("拖出了边按最快滚", () => {
    expect(edgeScrollStep(60, 100, 548)).toBe(-10);
    expect(edgeScrollStep(700, 100, 548)).toBe(10);
  });
});

describe("松手后的时间写在哪", () => {
  const size = { width: 100, height: 20 };

  it("字的下边在指针上方 56 像素，横向以指针为中心", () => {
    expect(dragLabelPlace({ x: 200, y: 400 }, size, 390)).toEqual({ left: 150, top: 324 });
  });

  it("左右夹在屏幕里，留 8 像素", () => {
    expect(dragLabelPlace({ x: 20, y: 400 }, size, 390)).toEqual({ left: 8, top: 324 });
    expect(dragLabelPlace({ x: 380, y: 400 }, size, 390)).toEqual({ left: 282, top: 324 });
  });

  it("上面放不下（离屏幕上边不到 8 像素）就放在指针下方 56 像素", () => {
    expect(dragLabelPlace({ x: 200, y: 84 }, size, 390)).toEqual({ left: 150, top: 8 });
    expect(dragLabelPlace({ x: 200, y: 70 }, size, 390)).toEqual({ left: 150, top: 126 });
  });
});
