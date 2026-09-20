import {
  addBlock,
  addDayInTz,
  addKind,
  deleteDay,
  deleteKind,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setBlockMark,
  setBlockLayer,
  setDays,
  updateKind,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { layoutRow, timelineSegments, type PlacedSegment } from "./timeline-layout";

interface Built {
  plan: Y.Doc;
  library: Y.Doc;
  /** 底座 id，按建的先后 */
  days: string[];
}

/** 在内存里搭一个从 10.1 起、北京时区的计划，按需放块，返回读出来的视图。 */
function build(dayCount: number, setup: (built: Built) => void): { plan: PlanView; library: LibraryView } {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: dayCount, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  setup({ plan, library, days: days.value.baseIds });
  const libraryView = readLibrary(library);
  return { plan: readPlan(plan, libraryView), library: libraryView };
}

interface TimedOptions {
  day?: number;
  kindId?: string;
}

function timed(built: Built, title: string, minute: number, duration: number, options: TimedOptions = {}): string {
  const result = addBlock(built.plan, built.library, {
    baseId: built.days[options.day ?? 0]!,
    kindId: options.kindId ?? "sight",
    title,
    minute,
    duration,
  });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function undated(built: Built, title: string): string {
  const result = addBlock(built.plan, built.library, { baseId: built.days[0]!, kindId: "sight", title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function onto(built: Built, blockId: string, ontoBlockId: string): void {
  const result = setBlockLayer(built.plan, built.library, blockId, ontoBlockId);
  if (!result.ok) throw new Error("叠放失败");
}

/** 每段写成「标题 行 从–到」，行从 1 数。 */
function segmentTexts(view: { plan: PlanView }, filter?: StatsFilter): string[] {
  return timelineSegments(view.plan, filter).map(
    (segment) => `${view.plan.blocks.get(segment.blockId)!.title} ${segment.row + 1} ${segment.from}–${segment.to}`,
  );
}

function layoutOf(view: { plan: PlanView; library: LibraryView }, row: number) {
  const segments = timelineSegments(view.plan).filter((segment) => segment.row === row);
  return layoutRow(segments, view.plan, view.library);
}

/** 放好的段写成「标题 第几道 缩几级 从–到」。 */
function placedTexts(view: { plan: PlanView }, placed: readonly PlacedSegment[]): string[] {
  return placed.map(
    (item) =>
      `${view.plan.blocks.get(item.blockId)!.title} ${item.lane} ${item.depth} ${item.from}–${item.to}`,
  );
}

describe("每个块画在哪几行", () => {
  it("按时长占宽度", () => {
    const view = build(1, (built) => timed(built, "西湖", 540, 180));
    expect(timelineSegments(view.plan)).toEqual([
      expect.objectContaining({ row: 0, from: 540, to: 720, continuesBefore: false, continuesAfter: false }),
    ]);
  });

  it("时长为 0：只有一个点", () => {
    const view = build(1, (built) => timed(built, "看潮", 720, 0));
    expect(segmentTexts(view)).toEqual(["看潮 1 720–720"]);
  });

  it("没排时间的块不画", () => {
    const view = build(1, (built) => {
      timed(built, "西湖", 540, 180);
      undated(built, "灵隐寺");
    });
    expect(segmentTexts(view)).toEqual(["西湖 1 540–720"]);
  });

  it("住一晚：接着画到下一行，接着的那头标出来", () => {
    const view = build(2, (built) => timed(built, "民宿", 1320, 600, { kindId: "lodging" }));
    expect(timelineSegments(view.plan)).toEqual([
      expect.objectContaining({ row: 0, from: 1320, to: 1440, continuesBefore: false, continuesAfter: true }),
      expect.objectContaining({ row: 1, from: 0, to: 480, continuesBefore: true, continuesAfter: false }),
    ]);
  });

  it("最后一天的夜航班：截在 24 点", () => {
    const view = build(1, (built) => timed(built, "红眼航班", 1380, 300, { kindId: "transit" }));
    expect(timelineSegments(view.plan)).toEqual([
      expect.objectContaining({ row: 0, from: 1380, to: 1440, continuesAfter: true }),
    ]);
  });

  it("飞到洛杉矶：后半段从北京 24 点（当地 09:00）画到 15:00", () => {
    const view = build(1, (built) => {
      const added = addDayInTz(built.plan, built.days[0]!, "America/Los_Angeles");
      if (!added.ok) throw new Error("加时区失败");
      built.days.push(added.value.baseId);
      timed(built, "飞洛杉矶", 1080, 720, { kindId: "transit" });
    });
    expect(view.plan.bases.map((base) => base.tz)).toEqual(["Asia/Shanghai", "America/Los_Angeles"]);
    expect(segmentTexts(view)).toEqual(["飞洛杉矶 1 1080–1440", "飞洛杉矶 2 540–900"]);
  });

  it("中间删掉了一天：落在缺的那天的部分不画", () => {
    const view = build(3, (built) => {
      timed(built, "民宿", 1320, 600, { kindId: "lodging" });
      deleteDay(built.plan, built.days[1]!);
    });
    expect(view.plan.bases.map((base) => base.date)).toEqual(["2026-10-01", "2026-10-03"]);
    expect(segmentTexts(view)).toEqual(["民宿 1 1320–1440"]);
  });

  it("只画通过筛选的块", () => {
    const view = build(1, (built) => {
      setBlockMark(built.plan, [timed(built, "西湖", 540, 180)], "struck");
      timed(built, "游船", 600, 60);
    });
    expect(segmentTexts(view, { marks: ["pending", "decided"] })).toEqual(["游船 1 600–660"]);
  });

  it("先按行、再按开始排", () => {
    const view = build(2, (built) => {
      timed(built, "晚饭", 1080, 60, { day: 1 });
      timed(built, "午饭", 720, 60, { day: 1 });
      timed(built, "西湖", 540, 180);
    });
    expect(segmentTexts(view)).toEqual(["西湖 1 540–720", "午饭 2 720–780", "晚饭 2 1080–1140"]);
  });
});

describe("一行里怎么摆", () => {
  it("同时进行的两件事分两道", () => {
    const view = build(1, (built) => {
      timed(built, "西湖", 540, 180);
      timed(built, "游船", 600, 60);
    });
    const row = layoutOf(view, 0);
    expect(placedTexts(view, row.main)).toEqual(["西湖 1 0 540–720", "游船 2 0 600–660"]);
    expect(row.laneCount).toBe(2);
  });

  it("不重叠的放同一道", () => {
    const view = build(1, (built) => {
      timed(built, "午饭", 720, 60, { kindId: "food" });
      timed(built, "西湖", 540, 180);
    });
    const row = layoutOf(view, 0);
    expect(placedTexts(view, row.main)).toEqual(["西湖 1 0 540–720", "午饭 1 0 720–780"]);
    expect(row.laneCount).toBe(1);
  });

  it("套在里面的叠在上面，比类型的层高几层缩几级", () => {
    const view = build(1, (built) => {
      const hengdian = timed(built, "横店", 480, 720);
      const palace = timed(built, "明清宫苑", 600, 120);
      const photo = timed(built, "拍照", 630, 30);
      onto(built, palace, hengdian);
      onto(built, photo, palace);
    });
    const row = layoutOf(view, 0);
    expect(placedTexts(view, row.main)).toEqual(["横店 1 0 480–1200", "明清宫苑 1 1 600–720", "拍照 1 2 630–660"]);
    expect(row.laneCount).toBe(1);
    expect(row.laneDepths).toEqual([2]);
  });

  it("只有套着块的那一道记着缩了几级，别的道是 0", () => {
    const view = build(1, (built) => {
      const hengdian = timed(built, "横店", 480, 720);
      const palace = timed(built, "明清宫苑", 600, 120);
      onto(built, palace, hengdian);
      timed(built, "午饭", 720, 60);
    });
    const row = layoutOf(view, 0);
    expect(placedTexts(view, row.main)).toEqual(["横店 1 0 480–1200", "明清宫苑 1 1 600–720", "午饭 2 0 720–780"]);
    expect(row.laneDepths).toEqual([1, 0]);
  });

  it("叠在旁边那道的块上：和最里面的外层块同一道", () => {
    const view = build(1, (built) => {
      timed(built, "横店", 480, 720);
      const lunch = timed(built, "午饭", 720, 60, { kindId: "food" });
      const dessert = timed(built, "甜点", 735, 30, { kindId: "food" });
      onto(built, dessert, lunch);
    });
    const row = layoutOf(view, 0);
    expect(placedTexts(view, row.main)).toEqual(["横店 1 0 480–1200", "午饭 2 0 720–780", "甜点 2 1 735–765"]);
  });

  it("放好以后按道、再按开始排（键盘 Tab 的顺序），不按层", () => {
    const view = build(1, (built) => {
      const hengdian = timed(built, "横店", 480, 180);
      timed(built, "游船", 660, 120);
      // 叠在横店上、却伸出横店：没有外层块，放进第 1 道、画在上面
      const photo = timed(built, "拍照", 600, 100);
      onto(built, photo, hengdian);
    });
    expect(placedTexts(view, layoutOf(view, 0).main)).toEqual(["横店 1 0 480–660", "拍照 1 1 600–700", "游船 1 0 660–780"]);
  });

  it("缩进最多 3 级", () => {
    const view = build(1, (built) => {
      let outer = timed(built, "第 0 层", 480, 720);
      for (const [index, minute] of [540, 600, 660, 690].entries()) {
        const inner = timed(built, `第 ${index + 1} 层`, minute, 20);
        onto(built, inner, outer);
        outer = inner;
      }
    });
    expect(layoutOf(view, 0).main.map((item) => item.depth)).toEqual([0, 1, 2, 3, 3]);
  });

  it("时长为 0 的点碰到块的两头也算重叠", () => {
    const view = build(1, (built) => {
      timed(built, "西湖", 540, 180);
      timed(built, "出发", 540, 0, { kindId: "transit" });
      timed(built, "看潮", 720, 0);
    });
    expect(placedTexts(view, layoutOf(view, 0).main)).toEqual(["西湖 1 0 540–720", "出发 2 0 540–540", "看潮 2 0 720–720"]);
  });

  it("停留、住宿进背景条，类型层低的先放", () => {
    const view = build(2, (built) => {
      timed(built, "民宿", 1320, 600, { kindId: "lodging" });
      timed(built, "在杭州", 0, 2880, { kindId: "stay" });
      timed(built, "西湖", 540, 180);
    });
    const oct1 = layoutOf(view, 0);
    expect(placedTexts(view, oct1.background)).toEqual(["在杭州 1 0 0–1440", "民宿 2 0 1320–1440"]);
    expect(placedTexts(view, oct1.main)).toEqual(["西湖 1 0 540–720"]);
    expect(oct1.backgroundCount).toBe(2);

    const oct2 = layoutOf(view, 1);
    expect(placedTexts(view, oct2.background)).toEqual(["在杭州 1 0 0–1440", "民宿 2 0 0–480"]);
    expect(oct2.main).toEqual([]);
    expect(oct2.laneCount).toBe(1);
  });

  it("住宿类型改到最上层，民宿进主轨", () => {
    const view = build(2, (built) => {
      timed(built, "民宿", 1320, 600, { kindId: "lodging" });
      timed(built, "在杭州", 0, 2880, { kindId: "stay" });
      timed(built, "西湖", 540, 180);
      updateKind(built.library, "lodging", { layer: 2 });
    });
    const oct1 = layoutOf(view, 0);
    expect(placedTexts(view, oct1.background)).toEqual(["在杭州 1 0 0–1440"]);
    expect(placedTexts(view, oct1.main)).toEqual(["西湖 1 0 540–720", "民宿 1 0 1320–1440"]);
  });

  it("类型被删了按最上层算，进主轨", () => {
    const view = build(1, (built) => {
      const camping = addKind(built.library, { name: "露营", color: "#8fa9bd", layer: 0 });
      if (!camping.ok) throw new Error("建类型失败");
      timed(built, "营地", 0, 600, { kindId: camping.value.kindId });
      deleteKind(built.library, camping.value.kindId);
    });
    const row = layoutOf(view, 0);
    expect(row.background).toEqual([]);
    expect(placedTexts(view, row.main)).toEqual(["营地 1 0 0–600"]);
  });

  it("没有背景块时背景 0 条", () => {
    const view = build(1, (built) => timed(built, "西湖", 540, 180));
    const row = layoutOf(view, 0);
    expect(row.background).toEqual([]);
    expect(row.backgroundCount).toBe(0);
    expect(row.main.map((item) => item.track)).toEqual(["main"]);
  });
});
