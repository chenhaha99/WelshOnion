import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { effectiveLayer, followerCounts, followersOf, layerWhenOnto } from "./nesting";
import { readLibrary, readPlan, type BlockView, type PlanView } from "./read";
import { initLibraryDoc, initPlanDoc } from "./schema";
import { addBase, addBlock } from "./testing";

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

function blockOf(plan: PlanView, id: string): BlockView {
  const block = plan.blocks.get(id);
  if (!block) throw new Error(`no block ${id}`);
  return block;
}

describe("有效层", () => {
  test("自己没存层", () => {
    addBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60, kind_id: "sight" });
    const { lib, plan } = views();

    expect(effectiveLayer(blockOf(plan, "k"), lib)).toBe(2);
  });

  test("自己存了层", () => {
    addBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60, kind_id: "sight", layer: 3 });
    const { lib, plan } = views();

    expect(effectiveLayer(blockOf(plan, "k"), lib)).toBe(3);
  });

  test("类型被删了", () => {
    library.getMap("kinds").set(
      "c-top",
      new Y.Map<unknown>([
        ["name", "置顶"],
        ["color", "#123456"],
        ["layer", 5],
        ["builtin", false],
        ["order", 8],
      ]),
    );
    addBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60, kind_id: "gone-kind" });
    const { lib, plan } = views();

    expect(effectiveLayer(blockOf(plan, "k"), lib)).toBe(5);
  });
});

describe("哪些块会被带走", () => {
  test("横店一天", () => {
    addBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
    addBlock(planDoc, "mingqing", {
      start_base_id: "d1",
      start_minute: 600,
      duration_min: 120,
      kind_id: "sight",
      layer: 3,
    });
    addBlock(planDoc, "photo", { start_base_id: "d1", start_minute: 660, duration_min: 30, kind_id: "sight", layer: 4 });
    addBlock(planDoc, "lunch", { start_base_id: "d1", start_minute: 720, duration_min: 60, kind_id: "food" });
    addBlock(planDoc, "night", {
      start_base_id: "d1",
      start_minute: 1200,
      duration_min: 120,
      kind_id: "sight",
      layer: 3,
    });
    const { lib, plan } = views();

    expect(followersOf(plan, lib, "hengdian")).toEqual(["mingqing", "photo"]);
  });

  test("跨天的外层块", () => {
    addBlock(planDoc, "pass", { start_base_id: "d1", start_minute: 540, duration_min: 2160, kind_id: "sight" });
    addBlock(planDoc, "mingqing", {
      start_base_id: "d2",
      start_minute: 600,
      duration_min: 120,
      kind_id: "sight",
      layer: 3,
    });
    const { lib, plan } = views();

    expect(followersOf(plan, lib, "pass")).toEqual(["mingqing"]);
  });

  test("停留块不带走活动", () => {
    addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });
    addBlock(planDoc, "lunch", { start_base_id: "d2", start_minute: 720, duration_min: 60, kind_id: "food" });
    const { lib, plan } = views();

    expect(followersOf(plan, lib, "stay")).toEqual([]);
  });
});

describe("全计划每件事会带走几件", () => {
  test("一次算好，和一件件算的一样；没排时间的不在里面", () => {
    addBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
    addBlock(planDoc, "mingqing", { start_base_id: "d1", start_minute: 600, duration_min: 120, kind_id: "sight", layer: 3 });
    addBlock(planDoc, "photo", { start_base_id: "d1", start_minute: 660, duration_min: 30, kind_id: "sight", layer: 4 });
    addBlock(planDoc, "lunch", { start_base_id: "d1", start_minute: 720, duration_min: 60, kind_id: "food" });
    addBlock(planDoc, "pass", { start_base_id: "d1", start_minute: 540, duration_min: 2160, kind_id: "sight", layer: 1 });
    addBlock(planDoc, "todo", { start_base_id: "d2", slot: "day" });
    const { lib, plan } = views();

    const counts = followerCounts(plan, lib);

    for (const id of ["hengdian", "mingqing", "photo", "lunch", "pass"]) {
      expect(counts.get(id), id).toBe(followersOf(plan, lib, id).length);
    }
    expect(counts.get("hengdian")).toBe(2);
    // 层是 1：同一类型层里层更高的都带走，午饭（吃饭和游玩同一类型层）也算
    expect(counts.get("pass")).toBe(4);
    expect(counts.has("todo")).toBe(false);
  });
});

describe("叠上去时的层", () => {
  test("叠到同一类型层的块上", () => {
    addBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
    addBlock(planDoc, "mingqing", { start_base_id: "d1", kind_id: "sight" });
    const { lib, plan } = views();

    expect(layerWhenOnto(plan, lib, blockOf(plan, "mingqing"), "hengdian")).toBe(3);
  });

  test("叠到停留块上不算", () => {
    addBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });
    addBlock(planDoc, "lunch", { start_base_id: "d1", kind_id: "food" });
    const { lib, plan } = views();

    expect(layerWhenOnto(plan, lib, blockOf(plan, "lunch"), "stay")).toBeNull();
  });
});
