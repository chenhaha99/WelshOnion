import { addBlock, addTag, initLibraryDoc, initPlanDoc, readLibrary, readPlan, setBlockTag, setDays } from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { barHeight, barZones, planHasBarTags, wideMetrics, type BlockText } from "./timeline-geometry";

const TITLE: BlockText = { title: true, duration: false, money: false };
const TITLE_MONEY: BlockText = { title: true, duration: false, money: true };
const TITLE_DURATION: BlockText = { title: true, duration: true, money: false };
const MONEY: BlockText = { title: false, duration: false, money: true };
const NOTHING: BlockText = { title: false, duration: false, money: false };
const ALL: BlockText = { title: true, duration: true, money: true };

describe("横条分上中下三区：每道多高", () => {
  it.each([
    ["只写标题、没有书签栏", TITLE, 1, false, 28],
    ["标题加开销", TITLE_MONEY, 1, false, 40],
    ["标题加时长：时长也在最下面那一行", TITLE_DURATION, 1, false, 40],
    ["有书签栏、只写标题", TITLE, 1, true, 38],
    ["有书签栏、标题加开销", TITLE_MONEY, 1, true, 50],
    ["只开开销", MONEY, 1, false, 28],
    ["有书签栏、只开开销", MONEY, 1, true, 34],
    ["有书签栏、什么都不写", NOTHING, 1, true, 28],
    ["什么都不写", NOTHING, 1, false, 28],
    ["标题写 3 行", TITLE, 3, false, 60],
    ["标题写 4 行、有书签栏、开着附件栏", ALL, 4, true, 98],
  ])("%s：每道 %#", (_name, blockText, lines, tagBar, lane) => {
    expect(wideMetrics(barZones(blockText, lines, tagBar)).lane).toBe(lane);
  });

  it("关掉「标题」时拉动条不管用：行数算 0", () => {
    expect(barZones(MONEY, 3, false).lines).toBe(0);
    expect(barHeight(barZones(MONEY, 3, false))).toBe(24);
  });
});

describe("套在里面的块每级往下让多少", () => {
  it.each([
    ["没有书签栏、一行字：和以前一样 18", TITLE, 1, false, 18],
    ["有书签栏、两行字：书签栏 12 加两行 32", TITLE, 2, true, 44],
    ["关掉「标题」：最少也让 18", MONEY, 1, true, 18],
  ])("%s", (_name, blockText, lines, tagBar, nest) => {
    expect(wideMetrics(barZones(blockText, lines, tagBar)).nest).toBe(nest);
  });
});

describe("什么时候有书签栏", () => {
  /** 10.1：09:00 起 1 小时的「西湖」、没排时间的「河坊街」、22:00 起的「民宿」（住宿，画成背景细条）、12:00 起 0 分钟的「看潮」；按需挂上「必去」。 */
  function planWith(timedTagged: boolean, undatedTagged: boolean, others: { lodging?: boolean; point?: boolean } = {}) {
    const library = new Y.Doc();
    initLibraryDoc(library);
    const planDoc = new Y.Doc();
    initPlanDoc(planDoc, "p1");
    const days = setDays(planDoc, { startDate: "2026-10-01", count: 1, tz: "Asia/Shanghai" });
    if (!days.ok) throw new Error("建天失败");
    const [oct1] = days.value.baseIds;
    const tag = addTag(library, { name: "必去", color: "#c08d68" });
    if (!tag.ok) throw new Error("建标签失败");
    const timed = addBlock(planDoc, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
    const undated = addBlock(planDoc, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" });
    const lodging = addBlock(planDoc, library, { baseId: oct1!, kindId: "lodging", title: "民宿", minute: 1320, duration: 120 });
    const point = addBlock(planDoc, library, { baseId: oct1!, kindId: "sight", title: "看潮", minute: 720, duration: 0 });
    if (!timed.ok || !undated.ok || !lodging.ok || !point.ok) throw new Error("建块失败");
    if (timedTagged) setBlockTag(planDoc, library, [timed.value.blockId], tag.value.tagId, true);
    if (undatedTagged) setBlockTag(planDoc, library, [undated.value.blockId], tag.value.tagId, true);
    if (others.lodging) setBlockTag(planDoc, library, [lodging.value.blockId], tag.value.tagId, true);
    if (others.point) setBlockTag(planDoc, library, [point.value.blockId], tag.value.tagId, true);
    const libraryView = readLibrary(library);
    return { plan: readPlan(planDoc, libraryView), libraryView };
  }

  function hasBar(built: ReturnType<typeof planWith>): boolean {
    return planHasBarTags(built.plan, built.libraryView);
  }

  it("画在主轨上、有时长的横条挂着标签才有", () => {
    expect(hasBar(planWith(true, false))).toBe(true);
    expect(hasBar(planWith(false, false))).toBe(false);
  });

  it("没排时间的、背景细条、时长为 0 的挂着标签不算：它们不画书签栏", () => {
    expect(hasBar(planWith(false, true))).toBe(false);
    expect(hasBar(planWith(false, false, { lodging: true }))).toBe(false);
    expect(hasBar(planWith(false, false, { point: true }))).toBe(false);
  });
});
