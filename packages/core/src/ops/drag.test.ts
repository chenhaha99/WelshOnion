import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary, readPlan, type PlanView } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock as seedBlock, addExpense } from "../testing";
import { previewSetBlockTimed, setBlockTimed } from "./blocks";
import { duplicateBlock, moveBlock, previewDrop, resizeBlockStart, setBlockLayer, shiftDayFrom } from "./drag";
import { createPlanUndoManager } from "./origin";
import type { OpResult } from "./result";

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

function raw(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("blocks").get(id);
}

function position(id: string): [unknown, unknown] {
  return [raw(id)?.get("start_base_id"), raw(id)?.get("start_minute")];
}

/** 横店（d1 540 起 720）里套着明清宫苑（600 起 120，层 3）和拍照（660 起 30，层 4）；午饭（餐饮，720 起 60）不跟着走 */
function hengdianDay() {
  seedBlock(planDoc, "hengdian", { start_base_id: "d1", start_minute: 540, duration_min: 720, kind_id: "sight" });
  seedBlock(planDoc, "mingqing", { start_base_id: "d1", start_minute: 600, duration_min: 120, kind_id: "sight", layer: 3 });
  seedBlock(planDoc, "photo", { start_base_id: "d1", start_minute: 660, duration_min: 30, kind_id: "sight", layer: 4 });
  seedBlock(planDoc, "lunch", { start_base_id: "d1", start_minute: 720, duration_min: 60, kind_id: "food" });
}

function view(): PlanView {
  return readPlan(planDoc, readLibrary(library));
}

function unwrap<T>(result: OpResult<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

/** 每个块坐在哪个底座、第几分钟、多长、存的层 */
function facts(plan: PlanView, ids: readonly string[]) {
  return ids.map((id) => {
    const block = plan.blocks.get(id)!;
    return [id, block.start_base_id, block.start_minute, block.duration_min, block.layer];
  });
}

describe("松手前算出松手后的样子", () => {
  const dayIds = ["hengdian", "mingqing", "photo", "lunch"];

  test("叠上去：算的时候文档不变，算出来的和真挪完一样", () => {
    hengdianDay();
    const before = planDoc.getMap("blocks").toJSON();
    const target = { baseId: "d1", minute: 720, placement: "onto" as const, ontoBlockId: "hengdian" };

    const preview = unwrap(previewDrop(view(), readLibrary(library), "lunch", target, { copy: false }));
    expect(planDoc.getMap("blocks").toJSON()).toEqual(before);
    moveBlock(planDoc, library, "lunch", target);

    expect(facts(preview, dayIds)).toEqual(facts(view(), dayIds));
    expect(facts(preview, ["lunch"])).toEqual([["lunch", "d1", 720, 60, 3]]);
  });

  test("带着里面的块过午夜", () => {
    hengdianDay();
    const target = { baseId: "d1", minute: 1320, placement: "beside" as const };

    const preview = unwrap(previewDrop(view(), readLibrary(library), "hengdian", target, { copy: false }));
    moveBlock(planDoc, library, "hengdian", target);

    expect(facts(preview, dayIds)).toEqual(facts(view(), dayIds));
    expect(facts(preview, ["photo"])).toEqual([["photo", "d2", 0, 30, 4]]);
  });

  test("复制：多出三个 :copy，和真复制出来的一样；原来的不变", () => {
    hengdianDay();
    const target = { baseId: "d2", minute: 540, placement: "beside" as const };

    const preview = unwrap(previewDrop(view(), readLibrary(library), "hengdian", target, { copy: true }));
    duplicateBlock(planDoc, library, "hengdian", target);

    const after = view();
    expect(preview.blocks.size).toBe(7);
    expect(facts(preview, dayIds)).toEqual(facts(after, dayIds));
    for (const source of ["hengdian", "mingqing", "photo"]) {
      // 测试里块的标题就是 id：真复制出来的块按标题认
      const real = [...after.blocks.values()].find((block) => block.title === source && block.id !== source)!;
      expect(facts(preview, [`${source}:copy`]).map(([, ...rest]) => rest)).toEqual(
        facts(after, [real.id]).map(([, ...rest]) => rest),
      );
    }
  });

  test("排上时间叠上去：算出来的和真排上一样，不在没排时间的排序里", () => {
    hengdianDay();
    seedBlock(planDoc, "u", { start_base_id: "d1", kind_id: "sight" });
    (planDoc.getMap<Y.Map<unknown>>("bases").get("d1")!.get("undated") as Y.Array<string>).push(["u"]);
    const options = { baseId: "d1", minute: 600, duration: 60, placement: "onto" as const, ontoBlockId: "hengdian" };

    const preview = unwrap(previewSetBlockTimed(view(), readLibrary(library), "u", options));
    setBlockTimed(planDoc, library, "u", options);

    expect(facts(preview, ["u"])).toEqual(facts(view(), ["u"]));
    expect(facts(preview, ["u"])).toEqual([["u", "d1", 600, 60, 3]]);
    const groups = preview.undated.get("d1")!;
    expect([...groups.day, ...groups.morning, ...groups.afternoon, ...groups.evening]).not.toContain("u");
  });
});

describe("位置怎么换算", () => {
  beforeEach(() => seedBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60 }));

  test("拖过午夜", () => {
    expect(moveBlock(planDoc, library, "k", { baseId: "d1", minute: 1500 }).ok).toBe(true);
    expect(position("k")).toEqual(["d2", 60]);
  });

  test("往前拖出第一天", () => {
    moveBlock(planDoc, library, "k", { baseId: "d1", minute: -30 });
    expect(position("k")).toEqual(["d1", 0]);
  });

  test("往后拖出最后一天", () => {
    moveBlock(planDoc, library, "k", { baseId: "d2", minute: 1500 });
    expect(position("k")).toEqual(["d2", 1439]);
  });
});

describe("拖左端改开始", () => {
  test("往右拖左端，里面的块不动", () => {
    hengdianDay();
    expect(resizeBlockStart(planDoc, "hengdian", { baseId: "d1", minute: 600 }).ok).toBe(true);

    expect(position("hengdian")).toEqual(["d1", 600]);
    expect(raw("hengdian")?.get("duration_min")).toBe(660);
    expect(position("mingqing")).toEqual(["d1", 600]);
    expect(raw("mingqing")?.get("duration_min")).toBe(120);
    expect(raw("mingqing")?.get("layer")).toBe(3);
    expect(position("photo")).toEqual(["d1", 660]);
    expect(raw("photo")?.get("duration_min")).toBe(30);
  });

  test("往左拖过午夜", () => {
    seedBlock(planDoc, "k", { start_base_id: "d2", start_minute: 60, duration_min: 60 });
    resizeBlockStart(planDoc, "k", { baseId: "d2", minute: -60 });
    expect(position("k")).toEqual(["d1", 1380]);
    expect(raw("k")?.get("duration_min")).toBe(180);
  });

  test("拖到和结束同一刻", () => {
    seedBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60 });
    resizeBlockStart(planDoc, "k", { baseId: "d1", minute: 660 });
    expect(position("k")).toEqual(["d1", 660]);
    expect(raw("k")?.get("duration_min")).toBe(0);
  });

  test("拖过结束：失败，什么都不改", () => {
    seedBlock(planDoc, "k", { start_base_id: "d1", start_minute: 600, duration_min: 60 });
    expect(resizeBlockStart(planDoc, "k", { baseId: "d1", minute: 700 })).toMatchObject({
      ok: false,
      error: { code: "INVALID_FIELD", field: "duration_min" },
    });
    expect(position("k")).toEqual(["d1", 600]);
    expect(raw("k")?.get("duration_min")).toBe(60);
  });

  test("往前拖出第一天", () => {
    seedBlock(planDoc, "k", { start_base_id: "d1", start_minute: 30, duration_min: 60 });
    resizeBlockStart(planDoc, "k", { baseId: "d1", minute: -30 });
    expect(position("k")).toEqual(["d1", 0]);
    expect(raw("k")?.get("duration_min")).toBe(90);
  });

  test("一步撤销", () => {
    hengdianDay();
    const undo = createPlanUndoManager(planDoc);
    resizeBlockStart(planDoc, "hengdian", { baseId: "d1", minute: 600 });
    undo.undo();
    expect(position("hengdian")).toEqual(["d1", 540]);
    expect(raw("hengdian")?.get("duration_min")).toBe(720);
  });

  test("块不存在或没排时间", () => {
    seedBlock(planDoc, "u", { start_base_id: "d1", duration_min: 60 });
    expect(resizeBlockStart(planDoc, "gone", { baseId: "d1", minute: 600 })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
    expect(resizeBlockStart(planDoc, "u", { baseId: "d1", minute: 600 })).toMatchObject({
      ok: false,
      error: { code: "NOT_TIMED" },
    });
  });
});

describe("挪块", () => {
  beforeEach(hengdianDay);

  test("拖中间挪时间", () => {
    moveBlock(planDoc, library, "hengdian", { baseId: "d1", minute: 600, placement: "beside" });

    expect(position("hengdian")).toEqual(["d1", 600]);
    expect(position("mingqing")).toEqual(["d1", 660]);
    expect(position("photo")).toEqual(["d1", 720]);
    expect(position("lunch")).toEqual(["d1", 720]);
  });

  test("换到另一天", () => {
    moveBlock(planDoc, library, "hengdian", { baseId: "d2", minute: 540 });

    expect(position("hengdian")).toEqual(["d2", 540]);
    expect(position("mingqing")).toEqual(["d2", 600]);
    expect(position("photo")).toEqual(["d2", 660]);
  });

  test("跟着走的块也会跨过午夜", () => {
    moveBlock(planDoc, library, "hengdian", { baseId: "d1", minute: 1320 });

    expect(position("hengdian")).toEqual(["d1", 1320]);
    expect(position("mingqing")).toEqual(["d1", 1380]);
    expect(position("photo")).toEqual(["d2", 0]);
  });

  test("一次拖拽一步撤销", () => {
    const undo = createPlanUndoManager(planDoc);

    moveBlock(planDoc, library, "hengdian", { baseId: "d2", minute: 540 });
    undo.undo();

    expect(position("hengdian")).toEqual(["d1", 540]);
    expect(position("mingqing")).toEqual(["d1", 600]);
    expect(position("photo")).toEqual(["d1", 660]);
  });

  test("块不存在", () => {
    expect(moveBlock(planDoc, library, "gone", { baseId: "d1", minute: 600 })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
  });
});

describe("挪块时层怎么变", () => {
  beforeEach(hengdianDay);

  test("叠到同一类型层的块上", () => {
    moveBlock(planDoc, library, "lunch", { baseId: "d1", minute: 720, placement: "onto", ontoBlockId: "hengdian" });

    expect(raw("lunch")?.get("layer")).toBe(3);
  });

  test("放旁边时里面的块跟着降层", () => {
    moveBlock(planDoc, library, "mingqing", { baseId: "d1", minute: 600, placement: "beside" });

    expect(raw("mingqing")?.has("layer")).toBe(false);
    expect(raw("photo")?.get("layer")).toBe(3);
  });

  test("还在原来的外层块里就保留层", () => {
    moveBlock(planDoc, library, "mingqing", { baseId: "d1", minute: 615 });

    expect(raw("mingqing")?.get("layer")).toBe(3);
    expect(raw("photo")?.get("layer")).toBe(4);
    expect(raw("photo")?.get("start_minute")).toBe(675);
  });

  test("离开原来的外层块就放旁边", () => {
    seedBlock(planDoc, "park", { start_base_id: "d2", start_minute: 0, duration_min: 1440, kind_id: "sight" });

    moveBlock(planDoc, library, "mingqing", { baseId: "d2", minute: 720 });

    expect(position("mingqing")).toEqual(["d2", 720]);
    expect(raw("mingqing")?.has("layer")).toBe(false);
    expect(position("photo")).toEqual(["d2", 780]);
    expect(raw("photo")?.get("layer")).toBe(3);
  });
});

describe("复制块", () => {
  test("标签照带", () => {
    seedBlock(planDoc, "lake", { start_base_id: "d1", start_minute: 540, duration_min: 60, tag_ids: ["t-must"] });

    const { blockId } = unwrap(duplicateBlock(planDoc, library, "lake", { baseId: "d2", minute: 540 }));

    expect((planDoc.getMap<Y.Map<unknown>>("blocks").get(blockId)?.get("tag_ids") as Y.Array<string>).toArray()).toEqual([
      "t-must",
    ]);
  });

  test("连里面的块一起复制", () => {
    hengdianDay();

    expect(duplicateBlock(planDoc, library, "hengdian", { baseId: "d2", minute: 540 }).ok).toBe(true);

    const onD2 = [...planDoc.getMap<Y.Map<unknown>>("blocks").values()]
      .filter((block) => block.get("start_base_id") === "d2")
      .map((block) => [block.get("start_minute"), block.get("duration_min"), block.get("layer") ?? null])
      .sort((a, b) => (a[0] as number) - (b[0] as number));
    expect(onD2).toEqual([
      [540, 720, null],
      [600, 120, 3],
      [660, 30, 4],
    ]);
    expect(position("hengdian")).toEqual(["d1", 540]);
    expect(position("mingqing")).toEqual(["d1", 600]);
    expect(planDoc.getMap("blocks").size).toBe(7);
  });

  test("钱复制成独立的新一笔", () => {
    hengdianDay();
    addExpense(planDoc, "ticket", { amount_cents: 10000, block_ids: ["mingqing", "photo"] });
    addExpense(planDoc, "meal", { amount_cents: 5000, block_ids: ["mingqing", "lunch"] });

    duplicateBlock(planDoc, library, "hengdian", { baseId: "d2", minute: 540 });

    const blocks = [...planDoc.getMap<Y.Map<unknown>>("blocks").entries()];
    const copyAt = (minute: number) =>
      blocks.find(([, block]) => block.get("start_base_id") === "d2" && block.get("start_minute") === minute)?.[0];
    const expenses = planDoc.getMap<Y.Map<unknown>>("expenses");
    const linked = (expense: Y.Map<unknown> | undefined) => (expense?.get("block_ids") as Y.Array<string>).toArray();

    expect(expenses.size).toBe(3);
    const copied = [...expenses.entries()].find(([id]) => id !== "ticket" && id !== "meal")?.[1];
    expect(copied?.get("amount_cents")).toBe(10000);
    expect(linked(copied)).toEqual([copyAt(600), copyAt(660)]);
    expect(linked(expenses.get("ticket"))).toEqual(["mingqing", "photo"]);
    expect(linked(expenses.get("meal"))).toEqual(["mingqing", "lunch"]);
  });

  test("落点决定开始时间", () => {
    seedBlock(planDoc, "k", { start_base_id: "d1", start_minute: 840, duration_min: 120 });

    const result = duplicateBlock(planDoc, library, "k", { baseId: "d1", minute: 1140 });

    const copyId = result.ok ? result.value.blockId : "";
    expect(position(copyId)).toEqual(["d1", 1140]);
    expect(raw(copyId)?.get("duration_min")).toBe(120);
  });
});

describe("叠放或拿出来", () => {
  beforeEach(hengdianDay);

  test("套进同一类型层的块", () => {
    expect(setBlockLayer(planDoc, library, "lunch", "hengdian").ok).toBe(true);

    expect(raw("lunch")?.get("layer")).toBe(3);
    expect(raw("lunch")?.get("start_minute")).toBe(720);
  });

  test("拿出来时里面的块跟着降层", () => {
    setBlockLayer(planDoc, library, "mingqing", null);

    expect(raw("mingqing")?.has("layer")).toBe(false);
    expect(raw("photo")?.get("layer")).toBe(3);
  });

  test("套到不同类型层的块上不算", () => {
    seedBlock(planDoc, "stay", { start_base_id: "d1", start_minute: 0, duration_min: 2880, kind_id: "stay" });

    setBlockLayer(planDoc, library, "lunch", "stay");

    expect(raw("lunch")?.has("layer")).toBe(false);
  });
});

describe("从这里往后整体推迟", () => {
  beforeEach(() => {
    seedBlock(planDoc, "a", { start_base_id: "d1", start_minute: 780, duration_min: 300 });
    seedBlock(planDoc, "b", { start_base_id: "d1", start_minute: 900, duration_min: 60 });
    seedBlock(planDoc, "c", { start_base_id: "d1", start_minute: 1140, duration_min: 60 });
  });

  test("从 15:00 往后推迟 40 分钟", () => {
    expect(shiftDayFrom(planDoc, library, "d1", 900, 40).ok).toBe(true);

    expect(position("a")).toEqual(["d1", 780]);
    expect(position("b")).toEqual(["d1", 940]);
    expect(position("c")).toEqual(["d1", 1180]);
  });

  test("推迟到跨过午夜", () => {
    seedBlock(planDoc, "e", { start_base_id: "d1", start_minute: 1430, duration_min: 30 });

    shiftDayFrom(planDoc, library, "d1", 900, 40);

    expect(position("e")).toEqual(["d2", 30]);
  });

  test("提前半小时", () => {
    shiftDayFrom(planDoc, library, "d1", 900, -30);

    expect(position("a")).toEqual(["d1", 780]);
    expect(position("b")).toEqual(["d1", 870]);
    expect(position("c")).toEqual(["d1", 1110]);
  });
});
