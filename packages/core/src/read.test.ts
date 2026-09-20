import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { readLibrary, readPlan, reconcilePlanIndex, summarizePlan } from "./read";
import { initLibraryDoc, initPlanDoc } from "./schema";

type Fields = Record<string, unknown>;

function newPlanDoc(): Y.Doc {
  const doc = new Y.Doc();
  initPlanDoc(doc, "p1");
  return doc;
}

function newLibraryDoc(): Y.Doc {
  const doc = new Y.Doc();
  initLibraryDoc(doc);
  return doc;
}

function addBase(doc: Y.Doc, id: string, date: string, tz = "Asia/Shanghai", undated: string[] = []) {
  doc.getMap("bases").set(
    id,
    new Y.Map<unknown>([
      ["date", date],
      ["tz", tz],
      ["undated", Y.Array.from(undated)],
    ]),
  );
}

function addBlock(doc: Y.Doc, id: string, fields: Fields) {
  const { note, place_ids, tag_ids, ...rest } = fields;
  const block = new Y.Map<unknown>(
    Object.entries({ kind_id: "sight", title: id, created_by: "me", ...rest }),
  );
  block.set("place_ids", Y.Array.from((place_ids as string[] | undefined) ?? []));
  // 不给就不写：和标签出现以前建的事一样
  if (tag_ids !== undefined) block.set("tag_ids", Y.Array.from(tag_ids as string[]));
  if (typeof note === "string") {
    const text = new Y.Text();
    text.insert(0, note);
    block.set("note", text);
  }
  doc.getMap("blocks").set(id, block);
}

function addExpense(doc: Y.Doc, id: string, fields: Fields) {
  const { block_ids, ...rest } = fields;
  const expense = new Y.Map<unknown>(
    Object.entries({ currency: "CNY", basis: "total", kind_id: "other", title: id, created_by: "me", ...rest }),
  );
  expense.set("block_ids", Y.Array.from((block_ids as string[] | undefined) ?? []));
  doc.getMap("expenses").set(id, expense);
}

function addPlace(doc: Y.Doc, id: string) {
  doc.getMap("places").set(
    id,
    new Y.Map<unknown>([
      ["name", id],
      ["lat", 30.2],
      ["lng", 120.2],
      ["providers", new Y.Map<unknown>()],
    ]),
  );
}

function addTag(doc: Y.Doc, id: string, name: string, order: number) {
  doc.getMap("tags").set(
    id,
    new Y.Map<unknown>([
      ["name", name],
      ["color", "#c08d68"],
      ["order", order],
    ]),
  );
}

function read(planDoc: Y.Doc, libraryDoc: Y.Doc) {
  return readPlan(planDoc, readLibrary(libraryDoc));
}

describe("读取只走一个入口，不存在的字段给 null", () => {
  test("没排时间的块", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1" });

    const view = read(plan, newLibraryDoc());
    const block = view.blocks.get("k1");

    const nullableKeys = [
      "start_minute",
      "duration_min",
      "slot",
      "layer",
      "indent",
      "subtitle",
      "transport_mode",
      "distance_m",
      "note",
    ] as const;
    for (const key of nullableKeys) {
      expect(block?.[key], key).toBeNull();
    }
    expect(view.undated.get("d1")?.day).toEqual(["k1"]);
  });

  test("标记：没写、写了不认识的都是「确定」", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1" });
    addBlock(plan, "k2", { start_base_id: "d1", mark: "done" });
    addBlock(plan, "k3", { start_base_id: "d1", mark: "pending" });
    addBlock(plan, "k4", { start_base_id: "d1", mark: "yes" });
    addBlock(plan, "k5", { start_base_id: "d1", mark: true });

    const view = read(plan, newLibraryDoc());

    expect(["k1", "k2", "k3", "k4", "k5"].map((id) => view.blocks.get(id)?.mark)).toEqual([
      "decided",
      "done",
      "pending",
      "decided",
      "decided",
    ]);
  });

  test("事上没有状态，资料库里也没有", () => {
    const plan = newPlanDoc();
    const library = newLibraryDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1" });

    expect(read(plan, library).blocks.get("k1")).not.toHaveProperty("status");
    expect(readLibrary(library)).not.toHaveProperty("statuses");
  });

  test("长备注和数组", () => {
    const plan = newPlanDoc();
    const library = newLibraryDoc();
    addPlace(library, "pl1");
    addPlace(library, "pl2");
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", note: "慢慢走，看桥", place_ids: ["pl1", "pl2"] });

    const block = read(plan, library).blocks.get("k1");

    expect(block?.note).toBe("慢慢走，看桥");
    expect(block?.place_ids).toEqual(["pl1", "pl2"]);
  });

  test("金额没填", () => {
    const plan = newPlanDoc();
    addExpense(plan, "e1", {});

    expect(read(plan, newLibraryDoc()).expenses.get("e1")?.amount_cents).toBeNull();
  });
});

describe("底座排序", () => {
  test("出境当天两个时区", () => {
    const plan = newPlanDoc();
    addBase(plan, "b3", "2026-09-30", "Asia/Shanghai");
    addBase(plan, "b2", "2026-10-01", "Asia/Tokyo");
    addBase(plan, "b1", "2026-10-01", "Asia/Shanghai");

    expect(read(plan, newLibraryDoc()).bases.map((base) => base.id)).toEqual(["b3", "b1", "b2"]);
  });
});

describe("指向已删底座的块当成已删除", () => {
  test("底座被删、块还在", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "gone" });
    addExpense(plan, "e1", { block_ids: ["k1"] });

    const view = read(plan, newLibraryDoc());

    expect(view.blocks.has("k1")).toBe(false);
    expect(view.expenses.get("e1")?.block_ids).toEqual([]);
  });
});

describe("费用跳过指不到的块", () => {
  test("部分块不在了", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1" });
    addBlock(plan, "k2", { start_base_id: "d1" });
    addExpense(plan, "e1", { block_ids: ["k1", "gone", "k2"] });

    expect(read(plan, newLibraryDoc()).expenses.get("e1")?.block_ids).toEqual(["k1", "k2"]);
  });
});

describe("类型指不到时标成已删除", () => {
  test("自定义类型被删了", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", kind_id: "c-work" });

    expect(read(plan, newLibraryDoc()).blocks.get("k1")?.kind).toEqual({ id: "c-work", deleted: true });
  });
});

describe("地点跳过指不到的", () => {
  test("中间一个地点被删", () => {
    const plan = newPlanDoc();
    const library = newLibraryDoc();
    addPlace(library, "p1");
    addPlace(library, "p2");
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", place_ids: ["p1", "gone", "p2"] });

    const block = read(plan, library).blocks.get("k1");

    expect(block?.places.map((place) => place.id)).toEqual(["p1", "p2"]);
    expect(block?.place_ids).toEqual(["p1", "p2"]);
  });
});

describe("未定时块的顺序", () => {
  test("数组里有重复、已删、已排时间的 id", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01", "Asia/Shanghai", ["y", "gone", "t", "x", "y"]);
    for (const id of ["x", "y", "z", "w"]) {
      addBlock(plan, id, { start_base_id: "d1" });
    }
    addBlock(plan, "t", { start_base_id: "d1", start_minute: 600, duration_min: 60 });

    expect(read(plan, newLibraryDoc()).undated.get("d1")?.day).toEqual(["y", "x", "w", "z"]);
  });

  test("按格子分组", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01", "Asia/Shanghai", ["a", "b", "c"]);
    addBlock(plan, "a", { start_base_id: "d1", slot: "morning" });
    addBlock(plan, "b", { start_base_id: "d1" });
    addBlock(plan, "c", { start_base_id: "d1", slot: "morning" });

    const groups = read(plan, newLibraryDoc()).undated.get("d1");

    expect(groups?.morning).toEqual(["a", "c"]);
    expect(groups?.day).toEqual(["b"]);
    expect(groups?.afternoon).toEqual([]);
    expect(groups?.evening).toEqual([]);
  });
});

describe("同时有 layer 和 indent 时只认一个", () => {
  test("已排时间", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", start_minute: 600, duration_min: 60, layer: 3, indent: 1 });

    const block = read(plan, newLibraryDoc()).blocks.get("k1");

    expect(block?.layer).toBe(3);
    expect(block?.indent).toBeNull();
  });

  test("没排时间", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", layer: 3, indent: 1 });

    const block = read(plan, newLibraryDoc()).blocks.get("k1");

    expect(block?.layer).toBeNull();
    expect(block?.indent).toBe(1);
  });
});

describe("计划摘要", () => {
  test("出境当天多一行底座", () => {
    const plan = newPlanDoc();
    plan.getMap("plan").set("traveler_count", 2);
    addBase(plan, "a1", "2026-10-01", "Asia/Shanghai");
    addBase(plan, "a2", "2026-10-01", "America/Los_Angeles");
    addBase(plan, "a3", "2026-10-02", "America/Los_Angeles");

    expect(summarizePlan(read(plan, newLibraryDoc()))).toEqual({
      name: "未命名计划",
      traveler_count: 2,
      date_start: "2026-10-01",
      date_end: "2026-10-02",
      day_count: 2,
    });
  });

  test("还没排日期", () => {
    expect(summarizePlan(read(newPlanDoc(), newLibraryDoc()))).toEqual({
      name: "未命名计划",
      traveler_count: 1,
      date_start: null,
      date_end: null,
      day_count: 0,
    });
  });
});

describe("计划索引对账", () => {
  test("两边各多一个", () => {
    expect(reconcilePlanIndex(["p1", "p2"], ["p2", "p3"])).toEqual({ remove: ["p1"], add: ["p3"] });
  });
});

describe("标签跳过指不到的", () => {
  test("按标签的顺序排，同一个存了两遍只算一个，被删的跳过", () => {
    const plan = newPlanDoc();
    const library = newLibraryDoc();
    addTag(library, "t-rain", "下雨也能去", 2);
    addTag(library, "t-must", "必去", 1);
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1", tag_ids: ["t-rain", "gone", "t-must", "t-rain"] });

    const block = read(plan, library).blocks.get("k1");

    expect(block?.tag_ids).toEqual(["t-must", "t-rain"]);
    expect(block?.tags.map((tag) => tag.name)).toEqual(["必去", "下雨也能去"]);
  });

  test("标签出现以前建的事：没有这个键，读成没有标签", () => {
    const plan = newPlanDoc();
    addBase(plan, "d1", "2026-10-01");
    addBlock(plan, "k1", { start_base_id: "d1" });

    const block = read(plan, newLibraryDoc()).blocks.get("k1");

    expect([block?.tag_ids, block?.tags]).toEqual([[], []]);
  });

  test("资料库里的标签", () => {
    const library = newLibraryDoc();
    addTag(library, "t-must", "必去", 1);

    expect(readLibrary(library).tags.get("t-must")).toEqual({ id: "t-must", name: "必去", color: "#c08d68", order: 1 });
  });
});
