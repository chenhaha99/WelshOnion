import {
  addBlock,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setBlockLayer,
  setDays,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import {
  decideOnto,
  dropAction,
  droppedPlan,
  droppedRows,
  ontoAt,
  type DropInput,
  type HitContext,
} from "./timeline-drop";
import { layoutRow, timelineSegments, type RowLayout } from "./timeline-layout";

interface Built {
  plan: PlanView;
  library: LibraryView;
  /** 块 id，按标题找 */
  ids: Record<string, string>;
  rows: RowLayout[];
}

interface BlockSeed {
  title: string;
  day?: number;
  kindId?: string;
  minute?: number;
  duration?: number;
  /** 叠到哪块（标题）上 */
  onto?: string;
}

/** 在内存里搭一个从 10.1 起、北京时区的计划，放好块，读出视图和拖之前的行。 */
function build(dayCount: number, seeds: readonly BlockSeed[]): Built {
  const libraryDoc = new Y.Doc();
  initLibraryDoc(libraryDoc);
  const planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p");
  const days = setDays(planDoc, { startDate: "2026-10-01", count: dayCount, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  const ids: Record<string, string> = {};
  for (const seed of seeds) {
    const result = addBlock(planDoc, libraryDoc, {
      baseId: days.value.baseIds[seed.day ?? 0]!,
      kindId: seed.kindId ?? "sight",
      title: seed.title,
      ...(seed.minute === undefined ? { slot: "day" as const } : { minute: seed.minute, duration: seed.duration ?? 60 }),
    });
    if (!result.ok) throw new Error("建块失败");
    ids[seed.title] = result.value.blockId;
    if (seed.onto !== undefined) setBlockLayer(planDoc, libraryDoc, result.value.blockId, ids[seed.onto]!);
  }
  const library = readLibrary(libraryDoc);
  const plan = readPlan(planDoc, library);
  return { plan, library, ids, rows: rowsOf(plan, library) };
}

function rowsOf(plan: PlanView, library: LibraryView): RowLayout[] {
  const segments = timelineSegments(plan);
  return plan.bases.map((_, row) => layoutRow(segments.filter((segment) => segment.row === row), plan, library));
}

/** 第 row 行里 id 那块画在第几道、缩几级、从几分到几分。 */
function placeOf(rows: readonly RowLayout[], row: number, id: string) {
  const item = [...rows[row]!.background, ...rows[row]!.main].find((segment) => segment.blockId === id);
  return item && { lane: item.lane, depth: item.depth, from: item.from, to: item.to };
}

/** 横排：横轴从 (0, 0) 起、宽 1440 像素，一分钟一像素；主轨第 1 道的横条从 y=2 到 y=26。 */
const WIDE_AXIS = { left: 0, top: 0, width: 1440, height: 56 };

function wideContext(built: Built, excluded: string[], kindLayer = 2): HitContext {
  return {
    plan: built.plan,
    library: built.library,
    layout: built.rows[0]!,
    axis: WIDE_AXIS,
    orientation: "wide",
    excluded: new Set(excluded),
    kindLayer,
  };
}

describe("指针落在哪块的中间", () => {
  const day = [
    { title: "横店", minute: 480, duration: 720 },
    { title: "游船", day: 1, minute: 600, duration: 60 },
  ];

  it("横排：落在中间叠上去，落在上下边、空白处放旁边", () => {
    const built = build(2, day);
    const context = wideContext(built, [built.ids["游船"]!]);

    expect(ontoAt({ x: 600, y: 14 }, context)).toBe(built.ids["横店"]);
    expect(ontoAt({ x: 600, y: 5 }, context)).toBeNull();
    expect(ontoAt({ x: 600, y: 23 }, context)).toBeNull();
    expect(ontoAt({ x: 1300, y: 14 }, context)).toBeNull();
  });

  it("类型层不同的不算", () => {
    const built = build(1, [
      { title: "在杭州", kindId: "stay", minute: 0, duration: 1440 },
      { title: "午饭", kindId: "food", minute: 720, duration: 60 },
    ]);
    // 背景条在 y=0 到 y=14
    expect(ontoAt({ x: 600, y: 7 }, wideContext(built, [built.ids["午饭"]!]))).toBeNull();
  });

  it("被拖的块不算，看它下面的块", () => {
    const built = build(1, [
      { title: "横店", minute: 480, duration: 720 },
      { title: "明清宫苑", minute: 600, duration: 120, onto: "横店" },
    ]);
    // 明清宫苑缩 1 级：从 y=6 画到 y=26，正中间 y=16 落在横店的 58% 处
    expect(ontoAt({ x: 660, y: 16 }, wideContext(built, [built.ids["明清宫苑"]!]))).toBe(built.ids["横店"]);
  });

  it("叠着时看画在最上面的那块", () => {
    const built = build(1, [
      { title: "横店", minute: 480, duration: 720 },
      { title: "明清宫苑", minute: 600, duration: 120, onto: "横店" },
      { title: "拍照", minute: 900, duration: 30 },
    ]);
    expect(ontoAt({ x: 660, y: 16 }, wideContext(built, [built.ids["拍照"]!]))).toBe(built.ids["明清宫苑"]);
  });

  it("竖排：落在中间叠上去，落在左右边放旁边", () => {
    const built = build(1, [
      { title: "横店", minute: 480, duration: 720 },
      { title: "游船", minute: 1320, duration: 60 },
    ]);
    const context: HitContext = {
      ...wideContext(built, [built.ids["游船"]!]),
      axis: { left: 0, top: 0, width: 300, height: 1440 },
      orientation: "day",
    };

    expect(ontoAt({ x: 150, y: 600 }, context)).toBe(built.ids["横店"]);
    expect(ontoAt({ x: 20, y: 600 }, context)).toBeNull();
    expect(ontoAt({ x: 280, y: 600 }, context)).toBeNull();
  });

  it("时长为 0 的块按 12 像素宽量", () => {
    const built = build(1, [
      { title: "看潮", minute: 720, duration: 0 },
      { title: "游船", minute: 1320, duration: 60 },
    ]);
    expect(ontoAt({ x: 725, y: 14 }, wideContext(built, [built.ids["游船"]!]))).toBe(built.ids["看潮"]);
  });
});

describe("叠上去还是放旁边", () => {
  it("正画着的样子里指针落在哪块，和现在的判定一样：不变", () => {
    const hitWith = vi.fn(() => "a");
    expect(decideOnto("a", hitWith)).toBe("a");
    expect(hitWith).toHaveBeenCalledTimes(1);
  });

  it("换过去以后还是它：换", () => {
    expect(decideOnto(null, (onto) => (onto === null ? "a" : "a"))).toBe("a");
  });

  it("换过去以后指针下面又该换回来：保持现在的", () => {
    expect(decideOnto(null, (onto) => (onto === null ? "a" : null))).toBeNull();
  });
});

/** 按住栏里的 title 拖，其余照常（在第 1 行的栏里）。 */
function chipDrag(built: Built, title: string, fields: Partial<DropInput>): DropInput {
  return {
    source: "chip",
    blockId: built.ids[title]!,
    mode: "move",
    alt: false,
    zone: { kind: "axis" },
    homeRow: 0,
    down: { row: 0, minute: 0 },
    now: { row: 0, minute: 0 },
    span: { start: 0, duration: 60 },
    moved: true,
    ontoId: null,
    ...fields,
  };
}

/** 按住 title 的横条拖：从 down 拖到 now（行、分钟），其余照常。 */
function segmentDrag(built: Built, title: string, fields: Partial<DropInput>): DropInput {
  const block = built.plan.blocks.get(built.ids[title]!)!;
  const row = built.plan.bases.findIndex((base) => base.id === block.start_base_id);
  const start = row * 1440 + block.start_minute!;
  return {
    source: "segment",
    blockId: block.id,
    mode: "move",
    alt: false,
    zone: { kind: "axis" },
    homeRow: null,
    down: { row, minute: block.start_minute! },
    now: { row, minute: block.start_minute! },
    span: { start, duration: block.duration_min ?? 0 },
    moved: true,
    ontoId: null,
    ...fields,
  };
}

describe("松手后做什么、松手后的计划", () => {
  const twoLanes = [
    { title: "横店", minute: 480, duration: 720 },
    { title: "明清宫苑", minute: 600, duration: 120 },
  ];

  it("挪、叠上去：明清宫苑到横店那一道、缩 1 级", () => {
    const built = build(2, twoLanes);
    const input = segmentDrag(built, "明清宫苑", { ontoId: built.ids["横店"]! });

    const action = dropAction(input, built.plan, null)!;
    expect(action).toEqual({ kind: "move", blockId: built.ids["明清宫苑"], copy: false, baseId: built.plan.bases[0]!.id, minute: 600, ontoId: built.ids["横店"] });
    const rows = rowsOf(droppedPlan(built.plan, built.library, action)!, built.library);
    expect(placeOf(rows, 0, built.ids["明清宫苑"]!)).toMatchObject({ lane: 1, depth: 1 });
  });

  it("按着 Alt：原来的不动，复制出来的画在松手的那一天", () => {
    const built = build(2, twoLanes);
    const input = segmentDrag(built, "明清宫苑", { alt: true, now: { row: 1, minute: 600 } });

    const dropped = droppedPlan(built.plan, built.library, dropAction(input, built.plan, null)!)!;
    const rows = rowsOf(dropped, built.library);
    expect(placeOf(rows, 0, built.ids["明清宫苑"]!)).toMatchObject({ lane: 2, from: 600 });
    expect(placeOf(rows, 1, `${built.ids["明清宫苑"]}:copy`)).toMatchObject({ lane: 1, from: 600, to: 720 });
  });

  it("从栏里拖到横轴上：排上时间，吸附到 15 分钟，没填时长给 1 小时", () => {
    const built = build(1, [{ title: "河坊街" }]);

    const action = dropAction(chipDrag(built, "河坊街", { now: { row: 0, minute: 842 } }), built.plan, null)!;
    expect(action).toMatchObject({ kind: "timed", minute: 840, duration: 60 });
    const block = droppedPlan(built.plan, built.library, action)!.blocks.get(built.ids["河坊街"]!)!;
    expect([block.start_minute, block.duration_min]).toEqual([840, 60]);
  });

  it("拖右端、拖左端：只改被拖块的时间，结束或开始不动", () => {
    const built = build(1, [{ title: "西湖", minute: 540, duration: 180 }]);
    const lake = built.ids["西湖"]!;

    const longer = dropAction(segmentDrag(built, "西湖", { mode: "end", down: { row: 0, minute: 720 }, now: { row: 0, minute: 780 } }), built.plan, null)!;
    const later = dropAction(segmentDrag(built, "西湖", { mode: "start", down: { row: 0, minute: 540 }, now: { row: 0, minute: 600 } }), built.plan, null)!;

    const ended = droppedPlan(built.plan, built.library, longer)!.blocks.get(lake)!;
    expect([ended.start_minute, ended.duration_min]).toEqual([540, 240]);
    const started = droppedPlan(built.plan, built.library, later)!.blocks.get(lake)!;
    expect([started.start_minute, started.duration_min]).toEqual([600, 120]);
  });

  it("拖进栏里：时间轴不重排；拖回原来那天的栏：什么都不做", () => {
    const built = build(1, [{ title: "西湖", minute: 540, duration: 180 }, { title: "河坊街" }]);

    const intoTray = dropAction(segmentDrag(built, "西湖", { zone: { kind: "tray", row: 0 } }), built.plan, null)!;
    expect(intoTray).toMatchObject({ kind: "undated", slot: "morning" });
    expect(droppedPlan(built.plan, built.library, intoTray)).toBeNull();

    expect(dropAction(chipDrag(built, "河坊街", { zone: { kind: "tray", row: 0 } }), built.plan, null)).toBeNull();
  });
});

describe("画的行", () => {
  it("横排：拖动中一行不比拖之前矮，竖排照松手后的", () => {
    const built = build(2, [
      { title: "横店", minute: 480, duration: 720 },
      { title: "游船", minute: 600, duration: 120 },
    ]);
    const input = segmentDrag(built, "游船", { now: { row: 1, minute: 600 } });
    const dropped = droppedPlan(built.plan, built.library, dropAction(input, built.plan, null)!)!;

    const wide = droppedRows(dropped, built.library, undefined, built.rows, true);
    expect(wide.map((row) => row.laneCount)).toEqual([2, 1]);
    expect(placeOf(wide, 1, built.ids["游船"]!)).toMatchObject({ lane: 1 });
    const day = droppedRows(dropped, built.library, undefined, built.rows, false);
    expect(day.map((row) => row.laneCount)).toEqual([1, 1]);
  });
});
