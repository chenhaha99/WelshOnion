import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock } from "../testing";
import { busyMinutes, dayFacts, freeGaps, occupiedMinutes, timeByKind, unscheduledMinutes } from "./time";

let library: Y.Doc;
let planDoc: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p1");
  addBase(planDoc, "d1", "2026-10-01");
  addBase(planDoc, "d2", "2026-10-02");
});

function views() {
  const lib = readLibrary(library);
  return { lib, plan: readPlan(planDoc, lib) };
}

function plain(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(map);
}

/** 横店（游玩）里套着午饭（餐饮，层 3） */
function hengdianWithLunch() {
  addBlock(planDoc, "hengdian", {
    start_base_id: "d1",
    start_minute: 540,
    duration_min: 720,
    kind_id: "sight",
  });
  addBlock(planDoc, "lunch", {
    start_base_id: "d1",
    start_minute: 720,
    duration_min: 120,
    kind_id: "food",
    layer: 3,
  });
}

/** 两天范例的第一天 */
function nanxunDayOne() {
  addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });
  addBlock(planDoc, "drive", { start_base_id: "d1", start_minute: 540, duration_min: 180, kind_id: "transit" });
  addBlock(planDoc, "walk", { start_base_id: "d1", start_minute: 780, duration_min: 300, kind_id: "sight" });
  addBlock(planDoc, "noodles", { start_base_id: "d1", start_minute: 810, duration_min: 60, kind_id: "food", layer: 3 });
  addBlock(planDoc, "inn", { start_base_id: "d1", start_minute: 1320, duration_min: 600, kind_id: "lodging" });
}

describe("统计前先按筛选条件去掉块", () => {
  beforeEach(hengdianWithLunch);

  test("筛掉餐饮", () => {
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib, { kindIds: ["sight"] }))).toEqual({ hengdian: 720 });
  });

  test("按标签筛：带着其中任何一个的留下", () => {
    library.getMap("tags").set("t-eat", new Y.Map<unknown>([["name", "吃"], ["color", "#c08d68"], ["order", 1]]));
    planDoc.getMap<Y.Map<unknown>>("blocks").get("lunch")?.set("tag_ids", Y.Array.from(["t-eat"]));
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib, { tagIds: ["t-eat", "t-other"] }))).toEqual({ lunch: 120 });
  });

  test("只看没完成的", () => {
    planDoc.getMap<Y.Map<unknown>>("blocks").get("hengdian")?.set("mark", "done");
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib, { marks: ["pending", "decided"] }))).toEqual({ lunch: 120 });
  });

  test("只看某几天：跨天的按开始那天算", () => {
    // 10.1 的「横店」里套着「午饭」；10.2 有「灵隐寺」；10.1 22:00 起的「民宿」画到 10.2，按开始那天算
    addBlock(planDoc, "temple", { start_base_id: "d2", start_minute: 540, duration_min: 120, kind_id: "sight" });
    addBlock(planDoc, "inn", { start_base_id: "d1", start_minute: 1320, duration_min: 600, kind_id: "lodging" });
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib, { baseIds: ["d2"] }))).toEqual({ temple: 120 });
    expect(Object.keys(plain(occupiedMinutes(plan, lib, { baseIds: ["d1"] }))).sort()).toEqual(["hengdian", "inn", "lunch"]);
    // 和别的条件一起：都要满足
    expect(plain(occupiedMinutes(plan, lib, { baseIds: ["d1"], kindIds: ["lodging"] }))).toEqual({ inn: 600 });
  });
});

describe("时间线占用法", () => {
  test("套在里面的块盖住外面的块", () => {
    hengdianWithLunch();
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib))).toEqual({ hengdian: 600, lunch: 120 });
  });

  test("并排的块各算各的", () => {
    addBlock(planDoc, "park", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
    addBlock(planDoc, "meal", { start_base_id: "d1", start_minute: 720, duration_min: 60, kind_id: "food" });
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib))).toEqual({ park: 720, meal: 60 });
  });

  test("两天范例的第一天", () => {
    nanxunDayOne();
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib))).toEqual({ stay: 1800, drive: 180, walk: 240, noodles: 60, inn: 600 });
  });

  test("跨天的块被第二天的块盖住", () => {
    addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });
    addBlock(planDoc, "lunch", { start_base_id: "d2", start_minute: 720, duration_min: 60, kind_id: "food" });
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib))).toEqual({ stay: 2820, lunch: 60 });
  });

  test("子块伸到外面", () => {
    addBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight", layer: 1 });
    addBlock(planDoc, "show", { start_base_id: "d1", start_minute: 1200, duration_min: 120, kind_id: "sight", layer: 2 });
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib))).toEqual({ hengdian: 660, show: 120 });
  });
});

describe("按类型汇总时间", () => {
  test("停留默认不进", () => {
    nanxunDayOne();
    const { lib, plan } = views();

    const result = timeByKind(plan, lib, { baseId: "d1" });

    expect(plain(result.minutes)).toEqual({ transit: 180, sight: 240, food: 60, lodging: 600 });
    expect(result.total).toBe(1080);
  });

  test("勾回停留", () => {
    nanxunDayOne();
    const { lib, plan } = views();

    const result = timeByKind(plan, lib, { baseId: "d1", includeBaseLayer: true });

    expect(plain(result.minutes)).toEqual({ stay: 1800, transit: 180, sight: 240, food: 60, lodging: 600 });
    expect(result.total).toBe(2880);
  });

  test("分母只算在看的类型", () => {
    hengdianWithLunch();
    const { lib, plan } = views();

    const both = timeByKind(plan, lib, { filter: { kindIds: ["sight", "food"] } });
    expect(plain(both.minutes)).toEqual({ sight: 600, food: 120 });
    expect(both.total).toBe(720);

    const sightOnly = timeByKind(plan, lib, { filter: { kindIds: ["sight"] } });
    expect(plain(sightOnly.minutes)).toEqual({ sight: 720 });
    expect(sightOnly.total).toBe(720);
  });
});

describe("这天还有多少没排", () => {
  test("第二天下午的几件事", () => {
    addBlock(planDoc, "stroll", { start_base_id: "d2", slot: "afternoon", duration_min: 120 });
    addBlock(planDoc, "xiaolianzhuang", { start_base_id: "d2", slot: "afternoon", duration_min: 45 });
    addBlock(planDoc, "zhangshiming", { start_base_id: "d2", slot: "afternoon", duration_min: 45 });
    addBlock(planDoc, "maybe", { start_base_id: "d2", slot: "evening" });
    const { plan } = views();

    expect(unscheduledMinutes(plan, "d2")).toBe(210);
  });
});

describe("这天的实际情况", () => {
  test("自驾的时长和里程", () => {
    addBlock(planDoc, "a", {
      start_base_id: "d1",
      start_minute: 540,
      duration_min: 180,
      kind_id: "transit",
      transport_mode: "drive",
      distance_m: 132000,
    });
    addBlock(planDoc, "b", {
      start_base_id: "d1",
      start_minute: 780,
      duration_min: 60,
      kind_id: "transit",
      transport_mode: "walk",
      distance_m: 2000,
    });
    addBlock(planDoc, "c", {
      start_base_id: "d1",
      start_minute: 900,
      duration_min: 60,
      kind_id: "transit",
      transport_mode: "drive",
      distance_m: 30000,
    });
    const { plan } = views();

    expect(dayFacts(plan, "d1")).toMatchObject({ driveMinutes: 240, driveDistanceM: 162000 });
  });

  test("几点起、几点收工", () => {
    addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 1440, kind_id: "stay" });
    addBlock(planDoc, "inn", { start_base_id: "d1", start_minute: 1320, duration_min: 600, kind_id: "lodging" });
    addBlock(planDoc, "walk", { start_base_id: "d1", start_minute: 540, duration_min: 300, kind_id: "sight" });
    addBlock(planDoc, "dinner", { start_base_id: "d1", start_minute: 900, duration_min: 60, kind_id: "food" });
    const { plan } = views();

    expect(dayFacts(plan, "d1")).toMatchObject({ firstStartMinute: 540, lastEndMinute: 960 });
  });

});

describe("这天排了多久", () => {
  /** 西湖、午饭叠了半小时，开车隔开；停留、住宿垫在下面 */
  function lakeDay() {
    addBlock(planDoc, "lake", { start_base_id: "d1", start_minute: 540, duration_min: 180, kind_id: "sight" });
    addBlock(planDoc, "lunch", { start_base_id: "d1", start_minute: 690, duration_min: 60, kind_id: "food" });
    addBlock(planDoc, "drive", { start_base_id: "d1", start_minute: 840, duration_min: 120, kind_id: "transit" });
    addBlock(planDoc, "inn", { start_base_id: "d1", start_minute: 1200, duration_min: 600, kind_id: "lodging" });
    addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 1440, kind_id: "stay" });
  }

  test("叠在一起的只算一次，停留、住宿不算", () => {
    lakeDay();
    const { plan } = views();

    expect(busyMinutes(plan, "d1")).toBe(330);
  });

  test("没排时间的、时长是 0 的不算", () => {
    addBlock(planDoc, "maybe", { start_base_id: "d1", duration_min: 90, slot: "day" });
    addBlock(planDoc, "meet", { start_base_id: "d1", start_minute: 600, duration_min: 0 });
    const { plan } = views();

    expect(busyMinutes(plan, "d1")).toBe(0);
  });

  test("跨午夜的整段算开始那天", () => {
    addBlock(planDoc, "night", { start_base_id: "d1", start_minute: 1380, duration_min: 120 });
    const { plan } = views();

    expect(busyMinutes(plan, "d1")).toBe(120);
    expect(busyMinutes(plan, "d2")).toBe(0);
  });

  test("筛掉的不算", () => {
    lakeDay();
    const { plan } = views();

    expect(busyMinutes(plan, "d1", { kindIds: ["sight"] })).toBe(180);
  });
});

describe("这天的空档", () => {
  function timed(id: string, kind: string, start: number, duration: number, baseId = "d1") {
    addBlock(planDoc, id, { start_base_id: baseId, start_minute: start, duration_min: duration, kind_id: kind });
  }

  test("中间空了一个半小时", () => {
    timed("drive", "transit", 480, 180);
    timed("lunch", "food", 750, 60);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([{ from: 660, to: 750 }]);
  });

  test("叠在一起的按最晚结束算", () => {
    timed("lake", "sight", 540, 180);
    timed("tea", "food", 600, 30);
    timed("tower", "sight", 780, 60);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([{ from: 720, to: 780 }]);
  });

  test("停留不算、住宿算", () => {
    timed("stay", "stay", 0, 4320);
    timed("lunch", "food", 720, 60);
    timed("inn", "lodging", 1260, 600);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([{ from: 780, to: 1260 }]);
  });

  test("时长为 0 的隔开两段", () => {
    timed("dinner", "food", 1080, 60);
    timed("leave", "transit", 1200, 0);
    timed("train", "transit", 1260, 120);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([
      { from: 1140, to: 1200 },
      { from: 1200, to: 1260 },
    ]);
  });

  test("不到 N 分钟不算，正好 N 分钟算", () => {
    timed("lake", "sight", 540, 180);
    timed("lunch", "food", 740, 60);
    timed("tower", "sight", 830, 60);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([{ from: 800, to: 830 }]);
  });

  test("别的天、没排时间的不算；不看筛选", () => {
    timed("lake", "sight", 540, 180);
    timed("other-day", "sight", 780, 60, "d2");
    addBlock(planDoc, "maybe", { start_base_id: "d1", duration_min: 60, slot: "day" });
    timed("lunch", "food", 840, 60);
    const { plan } = views();

    expect(freeGaps(plan, "d1", 30)).toEqual([{ from: 720, to: 840 }]);
  });
});
