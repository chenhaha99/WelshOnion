import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock } from "../testing";
import { dayFacts, occupiedMinutes, timeByKind, unscheduledMinutes } from "./time";

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

/** 横店（游玩，已确认）里套着午饭（餐饮，待定，层 3） */
function hengdianWithLunch() {
  addBlock(planDoc, "hengdian", {
    start_base_id: "d1",
    start_minute: 540,
    duration_min: 720,
    kind_id: "sight",
    status_id: "confirmed",
  });
  addBlock(planDoc, "lunch", {
    start_base_id: "d1",
    start_minute: 720,
    duration_min: 120,
    kind_id: "food",
    layer: 3,
    status_id: "pending",
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

  test("只看已确认的", () => {
    const { lib, plan } = views();

    expect(plain(occupiedMinutes(plan, lib, { statusIds: ["confirmed"] }))).toEqual({ hengdian: 720 });
  });
});

describe("时间轴占用法", () => {
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

  test("这天的时间预算", () => {
    planDoc.getMap("plan").set("default_day_budget", { start: "08:00", end: "22:00" });
    planDoc.getMap<Y.Map<unknown>>("bases").get("d1")?.set("day_budget", { max_drive_km: 300 });
    const { plan } = views();

    expect(dayFacts(plan, "d1").budget).toEqual({ start: "08:00", end: "22:00", max_drive_km: 300 });
    expect(dayFacts(plan, "d2").budget).toEqual({ start: "08:00", end: "22:00" });
  });

  test("没设任何预算", () => {
    const { plan } = views();

    expect(dayFacts(plan, "d1").budget).toBeNull();
  });
});
