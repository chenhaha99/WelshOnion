import {
  addBlock,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setDays,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import {
  axisOffset,
  axisPixel,
  FOLD_PX,
  FULL_DAY,
  hourLines,
  hourTicks,
  hourWindow,
  minuteAtPixel,
  offsetCss,
  type HourWindow,
} from "./timeline-window";

interface Timed {
  title: string;
  day?: number;
  minute: number;
  duration: number;
  kindId?: string;
}

/** 从 10.1 起、北京时区的计划，放几件排上时间的事。 */
function build(dayCount: number, blocks: readonly Timed[]): { plan: PlanView; library: LibraryView } {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: dayCount, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  for (const block of blocks) {
    const result = addBlock(plan, library, {
      baseId: days.value.baseIds[block.day ?? 0]!,
      kindId: block.kindId ?? "sight",
      title: block.title,
      minute: block.minute,
      duration: block.duration,
    });
    if (!result.ok) throw new Error("建块失败");
  }
  const libraryView = readLibrary(library);
  return { plan: readPlan(plan, libraryView), library: libraryView };
}

function windowOf(dayCount: number, blocks: readonly Timed[], fullDay = false): HourWindow {
  const { plan, library } = build(dayCount, blocks);
  return hourWindow(plan, library, fullDay);
}

const hour = (value: number) => value * 60;

describe("画哪几个钟点", () => {
  it("没有事、事都在 7–21 点里：默认 07:00–21:00", () => {
    expect(windowOf(2, [])).toEqual({ from: hour(7), to: hour(21) });
    expect(windowOf(2, [{ title: "西湖", minute: hour(9), duration: 180 }])).toEqual({ from: hour(7), to: hour(21) });
  });

  it("按下「0–24 点」：整天", () => {
    expect(windowOf(1, [{ title: "西湖", minute: hour(9), duration: 180 }], true)).toEqual(FULL_DAY);
  });

  it("主轨上的事放到它开始、结束的整点，看整个计划", () => {
    expect(
      windowOf(2, [
        { title: "航班", day: 1, minute: hour(5) + 40, duration: 120 },
        { title: "夜宵", minute: hour(21) + 30, duration: 45 },
      ]),
    ).toEqual({ from: hour(5), to: hour(23) });
  });

  it("跨午夜的事：两天的两段都要画得下", () => {
    expect(windowOf(2, [{ title: "夜车", minute: hour(20), duration: 720 }])).toEqual(FULL_DAY);
  });

  it("时长为 0 的前后各多留半小时", () => {
    expect(windowOf(1, [{ title: "集合", minute: hour(7), duration: 0 }])).toEqual({ from: hour(6), to: hour(21) });
    expect(windowOf(1, [{ title: "闭馆", minute: hour(21), duration: 0 }])).toEqual({ from: hour(7), to: hour(22) });
  });

  it("背景条伸进折起的那一截不展开；一件事每一段都不沾的才展开", () => {
    // 民宿 15:00 起 18 小时：10.1 15–24、10.2 0–9，都和 7–21 沾边
    expect(windowOf(2, [{ title: "民宿", minute: hour(15), duration: 1080, kindId: "lodging" }])).toEqual({
      from: hour(7),
      to: hour(21),
    });
    // 晚到的民宿 22:00 起 10 小时：10.1 那段整个在折起的那一截里，10.2 那段 0–8 沾边，按一件事算露得出来
    expect(windowOf(2, [{ title: "民宿", minute: hour(22), duration: 600, kindId: "lodging" }])).toEqual({
      from: hour(7),
      to: hour(21),
    });
    // 夜里的停留 22:00 起 1 小时：和 7–21 不沾
    expect(windowOf(1, [{ title: "看夜景", minute: hour(22), duration: 60, kindId: "stay" }])).toEqual({
      from: hour(7),
      to: hour(23),
    });
    // 21:00 起的也算不沾：挨着边，一点都露不出来
    expect(windowOf(1, [{ title: "看夜景", minute: hour(21), duration: 60, kindId: "stay" }])).toEqual({
      from: hour(7),
      to: hour(22),
    });
  });

  it("整件都在夜里的背景条：两天的两段都画得下", () => {
    expect(windowOf(2, [{ title: "民宿", minute: hour(22), duration: 480, kindId: "lodging" }])).toEqual(FULL_DAY);
  });

  it("背景条按主轨放过以后的范围看沾不沾", () => {
    expect(
      windowOf(1, [
        { title: "夜宵", minute: hour(22), duration: 60 },
        { title: "看夜景", minute: hour(21) + 30, duration: 60, kindId: "stay" },
      ]),
    ).toEqual({ from: hour(7), to: hour(23) });
  });
});

describe("位置和时刻互换", () => {
  const folded: HourWindow = { from: hour(7), to: hour(21) };
  const width = 1048;
  const inner = width - 2 * FOLD_PX;

  it("两头都折：左边那一截、中间、右边那一截是三段直线", () => {
    expect(axisPixel(folded, 0, width)).toBe(0);
    expect(axisPixel(folded, hour(3.5), width)).toBeCloseTo(FOLD_PX / 2);
    expect(axisPixel(folded, hour(7), width)).toBeCloseTo(FOLD_PX);
    expect(axisPixel(folded, hour(14), width)).toBeCloseTo(FOLD_PX + inner / 2);
    expect(axisPixel(folded, hour(21), width)).toBeCloseTo(width - FOLD_PX);
    expect(axisPixel(folded, hour(22.5), width)).toBeCloseTo(width - FOLD_PX / 2);
    expect(axisPixel(folded, hour(24), width)).toBeCloseTo(width);
  });

  it("写成 CSS：像素部分是 0 时照旧写百分比", () => {
    expect(offsetCss(axisOffset(FULL_DAY, hour(9)))).toBe("37.5%");
    expect(offsetCss(axisOffset(folded, 0))).toBe("0%");
    expect(offsetCss(axisOffset(folded, hour(14)))).toBe("50%");
    expect(offsetCss(axisOffset(folded, hour(9)))).toMatch(/^calc\(17\.14\d*px \+ 14\.28\d*%\)$/);
    expect(offsetCss(axisOffset(folded, hour(21)))).toBe("calc(-24px + 100%)");
  });

  it("只折一头：另一头没有那一截", () => {
    const early: HourWindow = { from: 0, to: hour(21) };
    expect(axisPixel(early, 0, width)).toBe(0);
    expect(axisPixel(early, hour(21), width)).toBeCloseTo(width - FOLD_PX);
    expect(axisPixel(early, hour(10.5), width)).toBeCloseTo((width - FOLD_PX) / 2);
  });

  it("从位置换回时刻：同一套，出了横轴两头按中间那段的比例接着算", () => {
    for (const minute of [0, 90, hour(7), hour(9) + 15, hour(21), hour(23), hour(24)]) {
      expect(minuteAtPixel(folded, axisPixel(folded, minute, width), width)).toBeCloseTo(minute);
    }
    const perPixel = hour(14) / inner;
    expect(minuteAtPixel(folded, -10, width)).toBeCloseTo(-10 * perPixel);
    expect(minuteAtPixel(folded, width + 10, width)).toBeCloseTo(hour(24) + 10 * perPixel);
    expect(minuteAtPixel(FULL_DAY, width / 2, width)).toBeCloseTo(hour(12));
    expect(minuteAtPixel(FULL_DAY, -width / 24, width)).toBeCloseTo(-60);
  });
});

describe("刻度和格线", () => {
  it("刻度：两头的钟点，中间写偶数钟点", () => {
    expect(hourTicks({ from: hour(7), to: hour(21) })).toEqual([7, 8, 10, 12, 14, 16, 18, 20, 21]);
    expect(hourTicks({ from: hour(6), to: hour(23) })).toEqual([6, 8, 10, 12, 14, 16, 18, 20, 22, 23]);
    expect(hourTicks(FULL_DAY)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24]);
  });

  it("每小时的淡线只画在展开的那段里", () => {
    expect(hourLines({ from: hour(7), to: hour(21) })).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(hourLines(FULL_DAY)).toHaveLength(23);
  });
});
