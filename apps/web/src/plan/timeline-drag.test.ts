import { describe, expect, it } from "vitest";
import {
  blankClickRange,
  blankDragRange,
  blankDragSpan,
  blankPieceInRow,
  clampLinear,
  dragLabelPlace,
  dragResult,
  magnetEdge,
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

describe("吸到前后事的边（手机上）", () => {
  // 同一天别的事：早饭 07:00–08:20（结束 500），午饭 12:00 开始（720）；10 分钟以内吸上
  const magnet = { edges: [420, 500, 720], tolerance: 10 };
  const lunchWalk = { start: 600, duration: 60 };

  it("挪：开始离前一件的结束不到 10 分钟，吸上去，不按 15 分钟取整", () => {
    // 往前挪 95 分钟：开始在 505，不吸是 510
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 505 }, lunchWalk, magnet)).toEqual({ start: 500, duration: 60 });
    expect(magnetEdge("move", { row: 0, minute: 600 }, { row: 0, minute: 505 }, lunchWalk, magnet)).toBe(500);
  });

  it("挪：结束离后一件的开始近，结束吸上去", () => {
    // 结束在 723：开始跟着变成 660
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 663 }, lunchWalk, magnet)).toEqual({ start: 660, duration: 60 });
  });

  it("两头都够得着：吸更近的那头", () => {
    const tight = { edges: [500, 562], tolerance: 10 };
    // 开始 506（离 500 差 6），结束 566（离 562 差 4）：吸结束
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 506 }, lunchWalk, tight)).toEqual({ start: 502, duration: 60 });
  });

  it("超过 10 分钟：照旧按 15 分钟取整，没吸上", () => {
    // 开始 526：离 500 差 26，取整到 525
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 526 }, lunchWalk, magnet)).toEqual({ start: 525, duration: 60 });
    expect(magnetEdge("move", { row: 0, minute: 600 }, { row: 0, minute: 526 }, lunchWalk, magnet)).toBeNull();
  });

  it("拖把手：右端吸到后一件的开始，左端吸到前一件的结束", () => {
    expect(dragResult("end", { row: 0, minute: 660 }, { row: 0, minute: 714 }, lunchWalk, magnet)).toEqual({ start: 600, duration: 120 });
    expect(dragResult("start", { row: 0, minute: 600 }, { row: 0, minute: 506 }, lunchWalk, magnet)).toEqual({ start: 500, duration: 160 });
  });

  it("不给磁铁：和原来一样", () => {
    expect(magnetEdge("move", { row: 0, minute: 600 }, { row: 0, minute: 505 }, lunchWalk)).toBeNull();
    expect(dragResult("move", { row: 0, minute: 600 }, { row: 0, minute: 505 }, lunchWalk)).toEqual({ start: 510, duration: 60 });
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

describe("框边自己滚", () => {
  // 框露在屏幕里的部分：坐标 100 到 548
  it("离两边都超过 40 像素不滚", () => {
    expect(edgeScrollStep(300, 100, 548)).toBe(0);
    expect(edgeScrollStep(140, 100, 548)).toBe(0);
    expect(edgeScrollStep(508, 100, 548)).toBe(0);
  });

  it("离靠前的边 40 像素以内往前滚，越靠边越快，至少 1 像素", () => {
    expect(edgeScrollStep(139, 100, 548)).toBe(-1);
    expect(edgeScrollStep(120, 100, 548)).toBe(-5);
    expect(edgeScrollStep(100, 100, 548)).toBe(-10);
  });

  it("离靠后的边 40 像素以内往后滚", () => {
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

describe("在空白处加一件事：从几点到几点", () => {
  it("点一下：往前取到 15 分钟，1 小时", () => {
    expect(blankClickRange(850)).toEqual({ from: 840, to: 900 });
    expect(blankClickRange(840)).toEqual({ from: 840, to: 900 });
    expect(blankClickRange(854.9)).toEqual({ from: 840, to: 900 });
  });

  it("点一下：夹在 0–24 点里", () => {
    expect(blankClickRange(-20)).toEqual({ from: 0, to: 60 });
    // 23:40：从 23:30 画到 24:00
    expect(blankClickRange(1420)).toEqual({ from: 1410, to: 1440 });
    expect(blankClickRange(1450)).toEqual({ from: 1425, to: 1440 });
  });

  it("拖：早的往前、晚的往后取到 15 分钟，往左往右一样", () => {
    expect(blankDragRange(905, 1040)).toEqual({ from: 900, to: 1050 });
    expect(blankDragRange(1040, 905)).toEqual({ from: 900, to: 1050 });
  });

  it("拖：至少 15 分钟，正好在 15 分钟上也是", () => {
    expect(blankDragRange(850, 853)).toEqual({ from: 840, to: 855 });
    expect(blankDragRange(840, 840)).toEqual({ from: 840, to: 855 });
  });

  it("跨天拖：指针挪到别的行，从按下的钟点一直画到那里", () => {
    // 10.1 22:10 按下，拖到 10.2 01:50：22:00 起 4 小时
    expect(blankDragSpan({ row: 0, minute: 1330 }, { row: 1, minute: 110 }, 3)).toEqual({ row: 0, from: 1320, to: 1560 });
    // 反过来拖一样
    expect(blankDragSpan({ row: 1, minute: 110 }, { row: 0, minute: 1330 }, 3)).toEqual({ row: 0, from: 1320, to: 1560 });
    // 跨好几天
    expect(blankDragSpan({ row: 0, minute: 600 }, { row: 2, minute: 600 }, 3)).toEqual({ row: 0, from: 600, to: 3480 });
  });

  it("跨天拖：两头夹在计划的第一天 00:00 和最后一天 24:00", () => {
    expect(blankDragSpan({ row: 2, minute: 1400 }, { row: 2, minute: 1700 }, 3)).toEqual({ row: 2, from: 1395, to: 1440 });
    expect(blankDragSpan({ row: 0, minute: 30 }, { row: -1, minute: 600 }, 3)).toEqual({ row: 0, from: 0, to: 30 });
  });

  it("跨天的那一段：每一行画自己那一截", () => {
    const range = { row: 0, from: 1320, to: 1560 };
    expect(blankPieceInRow(range, 0)).toEqual({ from: 1320, to: 1440 });
    expect(blankPieceInRow(range, 1)).toEqual({ from: 0, to: 120 });
    expect(blankPieceInRow(range, 2)).toBeNull();
    // 不跨天的那一段只画在自己那一行
    expect(blankPieceInRow({ row: 1, from: 600, to: 660 }, 1)).toEqual({ from: 600, to: 660 });
    expect(blankPieceInRow({ row: 1, from: 600, to: 660 }, 0)).toBeNull();
  });

  it("拖：两头夹在 0–24 点里", () => {
    expect(blankDragRange(60, -300)).toEqual({ from: 0, to: 60 });
    expect(blankDragRange(1400, 1700)).toEqual({ from: 1395, to: 1440 });
    expect(blankDragRange(1440, 1500)).toEqual({ from: 1425, to: 1440 });
  });
});
