import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock as seedBlock, addExpense } from "../testing";
import {
  addBlock,
  deleteBlock,
  moveUndated,
  resizeBlock,
  nextMark,
  setBlockMark,
  setBlockIndent,
  setBlockKind,
  setBlockTag,
  setBlockTimed,
  setBlockUndated,
  updateBlock,
} from "./blocks";
import { createPlanUndoManager } from "./origin";

let library: Y.Doc;
let planDoc: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p1");
});

function putTag(id: string, name: string) {
  library.getMap("tags").set(
    id,
    new Y.Map<unknown>([
      ["name", name],
      ["color", "#c08d68"],
      ["order", library.getMap("tags").size + 1],
    ]),
  );
}

function tagsOf(id: string): string[] | undefined {
  return (raw(id)?.get("tag_ids") as Y.Array<string> | undefined)?.toArray();
}

function raw(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("blocks").get(id);
}

function undatedOf(baseId: string): string[] {
  const base = planDoc.getMap<Y.Map<unknown>>("bases").get(baseId);
  return (base?.get("undated") as Y.Array<string>).toArray();
}

function view() {
  return readPlan(planDoc, readLibrary(library));
}

/** 横店（9:00 起 720 分钟）里套着明清宫苑（10:00–12:00，层 3）和拍照（11:00–11:30，层 4）；
 *  午饭（餐饮，12:00–13:00，没存层）和夜游（20:00–22:00，层 3）不会被带走 */
function hengdianDay() {
  seedBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
  seedBlock(planDoc, "mingqing", { start_base_id: "d1", start_minute: 600, duration_min: 120, kind_id: "sight", layer: 3 });
  seedBlock(planDoc, "photo", { start_base_id: "d1", start_minute: 660, duration_min: 30, kind_id: "sight", layer: 4 });
  seedBlock(planDoc, "lunch", { start_base_id: "d1", start_minute: 720, duration_min: 60, kind_id: "food" });
  seedBlock(planDoc, "night", { start_base_id: "d1", start_minute: 1200, duration_min: 120, kind_id: "sight", layer: 3 });
}

describe("新建块", () => {
  beforeEach(() => addBase(planDoc, "d1", "2026-10-01"));

  test("建一个定时块", () => {
    const result = addBlock(planDoc, library, {
      baseId: "d1",
      kindId: "sight",
      title: "逛古镇",
      minute: 780,
      duration: 300,
    });

    const block = raw(result.ok ? result.value.blockId : "");
    expect(block?.get("start_base_id")).toBe("d1");
    expect(block?.get("start_minute")).toBe(780);
    expect(block?.get("duration_min")).toBe(300);
    expect(block?.get("created_by")).toBe("me");
    expect((block?.get("place_ids") as Y.Array<string>).toArray()).toEqual([]);
    // 新建就写一个空数组：两边同时挂标签时挂进同一个数组
    expect(tagsOf(result.ok ? result.value.blockId : "")).toEqual([]);
    for (const key of ["slot", "layer", "indent", "status_id", "mark"]) {
      expect(block?.has(key), key).toBe(false);
    }
  });

  test("在上午格建一个未定时块", () => {
    seedBlock(planDoc, "x", { start_base_id: "d1", slot: "morning" });
    (planDoc.getMap<Y.Map<unknown>>("bases").get("d1")?.get("undated") as Y.Array<string>).push(["x"]);

    const result = addBlock(planDoc, library, {
      baseId: "d1",
      kindId: "sight",
      title: "小莲庄",
      slot: "morning",
      duration: 120,
    });

    const id = result.ok ? result.value.blockId : "";
    expect(raw(id)?.has("start_minute")).toBe(false);
    expect(raw(id)?.get("slot")).toBe("morning");
    expect(raw(id)?.get("duration_min")).toBe(120);
    expect(undatedOf("d1")).toEqual(["x", id]);
  });

  test("在整天格建", () => {
    const result = addBlock(planDoc, library, { baseId: "d1", kindId: "sight", title: "横店", slot: "day" });

    const id = result.ok ? result.value.blockId : "";
    expect(raw(id)?.has("slot")).toBe(false);
    expect(view().undated.get("d1")?.day).toEqual([id]);
  });

  test("带着标签建", () => {
    putTag("t-must", "必去");

    const result = addBlock(planDoc, library, { baseId: "d1", kindId: "sight", title: "西湖", slot: "day", tagIds: ["t-must"] });

    expect(tagsOf(result.ok ? result.value.blockId : "")).toEqual(["t-must"]);
  });

  test("标签不存在", () => {
    expect(
      addBlock(planDoc, library, { baseId: "d1", kindId: "sight", title: "x", slot: "day", tagIds: ["nope"] }),
    ).toEqual({ ok: false, error: { code: "NOT_FOUND", id: "nope" } });
    expect(planDoc.getMap("blocks").size).toBe(0);
  });

  test("类型不存在", () => {
    expect(addBlock(planDoc, library, { baseId: "d1", kindId: "nope", title: "x", minute: 600, duration: 60 })).toEqual(
      { ok: false, error: { code: "NOT_FOUND", id: "nope" } },
    );
    expect(planDoc.getMap("blocks").size).toBe(0);
  });

  test("开始分钟不合法", () => {
    expect(addBlock(planDoc, library, { baseId: "d1", kindId: "sight", title: "x", minute: 1440, duration: 60 })).toEqual(
      { ok: false, error: { code: "INVALID_FIELD", field: "start_minute" } },
    );
  });
});

describe("修改块", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01");
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 180, subtitle: "（看落日）" });
  });

  test("改成自驾并填距离", () => {
    expect(updateBlock(planDoc, library, "k1", { title: "开车去南浔", transport_mode: "drive", distance_m: 132000 }).ok).toBe(
      true,
    );

    expect(raw("k1")?.get("title")).toBe("开车去南浔");
    expect(raw("k1")?.get("transport_mode")).toBe("drive");
    expect(raw("k1")?.get("distance_m")).toBe(132000);
  });

  test("清掉短备注", () => {
    updateBlock(planDoc, library, "k1", { subtitle: null });

    expect(raw("k1")?.has("subtitle")).toBe(false);
  });

  test("换地点保持顺序", () => {
    updateBlock(planDoc, library, "k1", { place_ids: ["pl_home", "pl_nanxun"] });

    expect((raw("k1")?.get("place_ids") as Y.Array<string>).toArray()).toEqual(["pl_home", "pl_nanxun"]);
  });

  test("改长备注", () => {
    updateBlock(planDoc, library, "k1", { note: "慢慢走，看桥" });
    expect(view().blocks.get("k1")?.note).toBe("慢慢走，看桥");

    updateBlock(planDoc, library, "k1", { note: null });
    expect(raw("k1")?.has("note")).toBe(false);
  });

  test("距离不合法", () => {
    expect(updateBlock(planDoc, library, "k1", { distance_m: -5 })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "distance_m" },
    });
    expect(raw("k1")?.has("distance_m")).toBe(false);
  });
});

describe("改时长", () => {
  beforeEach(() => addBase(planDoc, "d1", "2026-10-01"));

  test("拉长大块里面的块不动", () => {
    hengdianDay();

    expect(resizeBlock(planDoc, "hengdian", 960).ok).toBe(true);

    expect(raw("hengdian")?.get("duration_min")).toBe(960);
    expect(raw("mingqing")?.get("start_minute")).toBe(600);
    expect(raw("mingqing")?.get("duration_min")).toBe(120);
  });

  test("零时长", () => {
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 690, duration_min: 30 });

    expect(resizeBlock(planDoc, "k1", 0).ok).toBe(true);
    expect(raw("k1")?.get("duration_min")).toBe(0);
  });
});

describe("删除块", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01");
    addBase(planDoc, "d2", "2026-10-02");
  });

  test("连同里面的块一起删", () => {
    hengdianDay();

    expect(deleteBlock(planDoc, library, "hengdian").ok).toBe(true);

    expect([...planDoc.getMap("blocks").keys()].sort()).toEqual(["lunch", "night"]);
  });

  test("钱跟着整批规则走", () => {
    hengdianDay();
    addExpense(planDoc, "ticket", { block_ids: ["mingqing", "photo"] });
    addExpense(planDoc, "night-ticket", { block_ids: ["mingqing", "night"] });

    deleteBlock(planDoc, library, "hengdian");

    const expenses = planDoc.getMap<Y.Map<unknown>>("expenses");
    expect(expenses.has("ticket")).toBe(false);
    expect((expenses.get("night-ticket")?.get("block_ids") as Y.Array<string>).toArray()).toEqual(["night"]);
  });

  test("删停留块不删活动", () => {
    seedBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });
    seedBlock(planDoc, "lunch", { start_base_id: "d2", start_minute: 720, duration_min: 60, kind_id: "food" });

    deleteBlock(planDoc, library, "stay");

    expect(planDoc.getMap("blocks").has("lunch")).toBe(true);
  });
});

describe("批量划掉", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01");
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60 });
    seedBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60 });
  });

  test("一次划掉两个，一步撤销", () => {
    const undo = createPlanUndoManager(planDoc);

    expect(setBlockMark(planDoc, ["k1", "k2"], "struck").ok).toBe(true);
    expect([raw("k1")?.get("mark"), raw("k2")?.get("mark")]).toEqual(["struck", "struck"]);

    undo.undo();
    expect([raw("k1")?.has("mark"), raw("k2")?.has("mark")]).toEqual([false, false]);
  });

  test("设成「待定」存下来，设回「定了」删掉键", () => {
    expect(setBlockMark(planDoc, ["k1"], "pending").ok).toBe(true);
    expect(raw("k1")?.get("mark")).toBe("pending");

    expect(setBlockMark(planDoc, ["k1"], "decided").ok).toBe(true);

    expect(raw("k1")?.has("mark")).toBe(false);
  });

  test("转一圈：定了 → 划掉 → 待定 → 定了", () => {
    expect(nextMark("decided")).toBe("struck");
    expect(nextMark("struck")).toBe("pending");
    expect(nextMark("pending")).toBe("decided");
  });

  test("有块找不到就一个都不改", () => {
    expect(setBlockMark(planDoc, ["k1", "gone"], "struck")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
    expect(raw("k1")?.has("mark")).toBe(false);
  });
});

describe("批量改类型", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01");
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60 });
    seedBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60 });
  });

  test("一次改两个，一步撤销", () => {
    const undo = createPlanUndoManager(planDoc);

    expect(setBlockKind(planDoc, library, ["k1", "k2"], "lodging").ok).toBe(true);
    expect([raw("k1")?.get("kind_id"), raw("k2")?.get("kind_id")]).toEqual(["lodging", "lodging"]);

    undo.undo();
    expect([raw("k1")?.get("kind_id"), raw("k2")?.get("kind_id")]).toEqual(["sight", "sight"]);
  });

  test("有块找不到就一个都不改", () => {
    expect(setBlockKind(planDoc, library, ["k1", "gone"], "lodging")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
    expect(raw("k1")?.get("kind_id")).toBe("sight");
  });

  test("资料库里没有这个类型就不改", () => {
    expect(setBlockKind(planDoc, library, ["k1"], "没有这个")).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "没有这个" },
    });
    expect(raw("k1")?.get("kind_id")).toBe("sight");
  });
});

describe("给一批事挂上、摘下一个标签", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01");
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60, tag_ids: [] });
    // 标签出现以前建的事：没有 tag_ids 这个键
    seedBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60 });
    putTag("t-must", "必去");
  });

  test("一次挂两件，一步撤销；以前建的事也能挂", () => {
    const undo = createPlanUndoManager(planDoc);

    expect(setBlockTag(planDoc, library, ["k1", "k2"], "t-must", true).ok).toBe(true);
    expect([tagsOf("k1"), tagsOf("k2")]).toEqual([["t-must"], ["t-must"]]);

    undo.undo();
    expect([tagsOf("k1"), tagsOf("k2")]).toEqual([[], undefined]);
  });

  test("已经挂着的不再挂一遍", () => {
    setBlockTag(planDoc, library, ["k1"], "t-must", true);

    setBlockTag(planDoc, library, ["k1"], "t-must", true);

    expect(tagsOf("k1")).toEqual(["t-must"]);
  });

  test("摘下留一个空数组；标签删掉了也照样摘", () => {
    setBlockTag(planDoc, library, ["k1"], "t-must", true);
    library.getMap("tags").delete("t-must");

    expect(setBlockTag(planDoc, library, ["k1"], "t-must", false).ok).toBe(true);

    expect(tagsOf("k1")).toEqual([]);
  });

  test("标签不存在就不挂", () => {
    expect(setBlockTag(planDoc, library, ["k1"], "nope", true)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "nope" },
    });
    expect(tagsOf("k1")).toEqual([]);
  });

  test("有事找不到就一件都不改", () => {
    expect(setBlockTag(planDoc, library, ["k1", "gone"], "t-must", true)).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
    expect(tagsOf("k1")).toEqual([]);
  });
});

describe("未定时块缩进", () => {
  beforeEach(() => addBase(planDoc, "d1", "2026-10-01"));

  test("缩进一级再取消", () => {
    seedBlock(planDoc, "u", { start_base_id: "d1", slot: "afternoon" });

    setBlockIndent(planDoc, "u", 1);
    expect(raw("u")?.get("indent")).toBe(1);

    setBlockIndent(planDoc, "u", null);
    expect(raw("u")?.has("indent")).toBe(false);
  });

  test("定时块不能缩进", () => {
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60 });

    expect(setBlockIndent(planDoc, "k1", 1)).toEqual({ ok: false, error: { code: "NOT_UNDATED" } });
  });
});

describe("变成未定时块", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01", "Asia/Shanghai", ["x", "y"]);
    addBase(planDoc, "d2", "2026-10-02");
    seedBlock(planDoc, "x", { start_base_id: "d1", slot: "afternoon" });
    seedBlock(planDoc, "y", { start_base_id: "d1", slot: "afternoon" });
    seedBlock(planDoc, "t", { start_base_id: "d1", start_minute: 600, duration_min: 60, layer: 3 });
  });

  test("拖回下午格、放在 y 前面", () => {
    expect(setBlockUndated(planDoc, "t", { slot: "afternoon", beforeId: "y" }).ok).toBe(true);

    expect(raw("t")?.has("start_minute")).toBe(false);
    expect(raw("t")?.has("layer")).toBe(false);
    expect(raw("t")?.get("slot")).toBe("afternoon");
    expect(undatedOf("d1")).toEqual(["x", "t", "y"]);
  });

  test("拖回整天格、不给位置", () => {
    setBlockUndated(planDoc, "t", { slot: "day" });

    expect(raw("t")?.has("slot")).toBe(false);
    expect(undatedOf("d1").at(-1)).toBe("t");
  });

  test("换到另一天", () => {
    setBlockUndated(planDoc, "t", { baseId: "d2", slot: "morning" });

    expect(raw("t")?.get("start_base_id")).toBe("d2");
    expect(undatedOf("d2")).toContain("t");
    expect(undatedOf("d1")).not.toContain("t");
  });
});

describe("排上时间", () => {
  beforeEach(() => addBase(planDoc, "d1", "2026-10-01", "Asia/Shanghai", ["u"]));

  test("排上时间", () => {
    seedBlock(planDoc, "u", { start_base_id: "d1", slot: "afternoon", indent: 1 });

    expect(setBlockTimed(planDoc, library, "u", { minute: 840, duration: 60 }).ok).toBe(true);

    expect(raw("u")?.get("start_minute")).toBe(840);
    expect(raw("u")?.get("duration_min")).toBe(60);
    for (const key of ["slot", "indent", "layer"]) {
      expect(raw("u")?.has(key), key).toBe(false);
    }
    expect(undatedOf("d1")).toEqual([]);
  });

  test("叠到横店上", () => {
    seedBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
    seedBlock(planDoc, "mingqing", { start_base_id: "d1", kind_id: "sight" });

    setBlockTimed(planDoc, library, "mingqing", {
      minute: 600,
      duration: 120,
      placement: "onto",
      ontoBlockId: "hengdian",
    });

    expect(raw("mingqing")?.get("layer")).toBe(3);
  });

  test("缩进不自动变成嵌套", () => {
    seedBlock(planDoc, "hengdian", { start_base_id: "d1", kind_id: "sight" });
    seedBlock(planDoc, "mingqing", { start_base_id: "d1", kind_id: "sight", indent: 1 });

    setBlockTimed(planDoc, library, "hengdian", { minute: 540, duration: 720 });
    setBlockTimed(planDoc, library, "mingqing", { minute: 600, duration: 120 });

    expect(raw("mingqing")?.has("layer")).toBe(false);
  });

  test("时长不合法", () => {
    seedBlock(planDoc, "u", { start_base_id: "d1", slot: "afternoon" });

    expect(setBlockTimed(planDoc, library, "u", { minute: 840, duration: -1 })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "duration_min" },
    });
    expect(raw("u")?.has("start_minute")).toBe(false);
  });
});

describe("未定时块排序", () => {
  beforeEach(() => {
    addBase(planDoc, "d1", "2026-10-01", "Asia/Shanghai", ["a", "b", "c"]);
    for (const id of ["a", "b", "c"]) {
      seedBlock(planDoc, id, { start_base_id: "d1", slot: "morning" });
    }
  });

  test("同一格里挪到最前", () => {
    expect(moveUndated(planDoc, "c", { slot: "morning", beforeId: "a" }).ok).toBe(true);

    expect(undatedOf("d1")).toEqual(["c", "a", "b"]);
  });

  test("挪到另一格", () => {
    moveUndated(planDoc, "b", { slot: "afternoon" });

    expect(raw("b")?.get("slot")).toBe("afternoon");
    const groups = view().undated.get("d1");
    expect(groups?.morning).toEqual(["a", "c"]);
    expect(groups?.afternoon).toEqual(["b"]);
  });

  test("定时块不能用", () => {
    seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60 });

    expect(moveUndated(planDoc, "k1", { slot: "morning" })).toEqual({ ok: false, error: { code: "NOT_UNDATED" } });
  });
});
