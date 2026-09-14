import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock as seedBlock } from "../testing";
import { updateBlock } from "./blocks";
import { addExpense } from "./expenses";
import { backfillFuel, findFuelBackfill } from "./fuel";
import { createPlanUndoManager } from "./origin";
import { setPlanSettings } from "./plan";

let library: Y.Doc;
let planDoc: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p1");
  addBase(planDoc, "d1", "2026-10-01");
  setPlanSettings(planDoc, { cost_per_km_cents: 80 });
});

function expenses() {
  return [...planDoc.getMap<Y.Map<unknown>>("expenses").values()];
}

function transitMoneyOn(blockId: string) {
  return expenses().filter(
    (expense) =>
      expense.get("kind_id") === "transit" && (expense.get("block_ids") as Y.Array<string>).toArray().includes(blockId),
  );
}

function driveBlock(id: string, fields: Record<string, unknown> = {}) {
  seedBlock(planDoc, id, {
    start_base_id: "d1",
    start_minute: 540,
    duration_min: 180,
    kind_id: "transit",
    transport_mode: "drive",
    ...fields,
  });
}

describe("自驾块自动挂油费", () => {
  test("填上距离就挂", () => {
    driveBlock("k");

    expect(updateBlock(planDoc, library, "k", { distance_m: 132000 }).ok).toBe(true);

    expect(expenses().map((expense) => expense.toJSON())).toEqual([
      {
        title: "油费过路（132km × 0.8 元）",
        amount_cents: 10560,
        currency: "CNY",
        basis: "total",
        kind_id: "transit",
        block_ids: ["k"],
        created_by: "me",
      },
    ]);
  });

  test("再改距离不会再挂一笔", () => {
    driveBlock("k");
    updateBlock(planDoc, library, "k", { distance_m: 132000 });

    updateBlock(planDoc, library, "k", { distance_m: 150000 });

    const fuel = transitMoneyOn("k");
    expect(fuel).toHaveLength(1);
    expect(fuel[0]?.get("amount_cents")).toBe(10560);
  });

  test("先填距离、后改成自驾也挂", () => {
    driveBlock("w", { transport_mode: "walk", distance_m: 2000 });

    updateBlock(planDoc, library, "w", { transport_mode: "drive" });

    expect(transitMoneyOn("w").map((expense) => expense.get("amount_cents"))).toEqual([160]);
  });

  test("块上已经有交通类的钱就不挂", () => {
    driveBlock("k");
    addExpense(planDoc, library, { title: "过路费", amountCents: 3000, kindId: "transit", blockIds: ["k"] });

    updateBlock(planDoc, library, "k", { distance_m: 132000 });

    expect(expenses()).toHaveLength(1);
  });

  test("没设每公里成本就不挂", () => {
    setPlanSettings(planDoc, { cost_per_km_cents: null });
    driveBlock("k");

    updateBlock(planDoc, library, "k", { distance_m: 132000 });

    expect(expenses()).toHaveLength(0);
  });

  test("撤销一次撤干净", () => {
    driveBlock("k");
    const undo = createPlanUndoManager(planDoc);

    updateBlock(planDoc, library, "k", { distance_m: 132000 });
    undo.undo();

    expect(planDoc.getMap<Y.Map<unknown>>("blocks").get("k")?.has("distance_m")).toBe(false);
    expect(expenses()).toHaveLength(0);
  });

  test("四舍五入到整数分", () => {
    driveBlock("k");

    updateBlock(planDoc, library, "k", { distance_m: 1234 });

    expect(transitMoneyOn("k")[0]?.get("amount_cents")).toBe(99);
  });
});

describe("事后补油费", () => {
  function fourBlocks() {
    driveBlock("a", { distance_m: 100000 });
    driveBlock("b", { distance_m: 50000 });
    addExpense(planDoc, library, { title: "过路费", amountCents: 3000, kindId: "transit", blockIds: ["b"] });
    driveBlock("c", { transport_mode: "walk", distance_m: 2000 });
    driveBlock("d");
  }

  test("找出要补的块", () => {
    fourBlocks();

    expect(findFuelBackfill(planDoc, library)).toEqual(["a"]);
  });

  test("一次补上、一步撤销", () => {
    fourBlocks();
    const undo = createPlanUndoManager(planDoc);

    expect(backfillFuel(planDoc, library, ["a"]).ok).toBe(true);
    expect(transitMoneyOn("a").map((expense) => expense.get("amount_cents"))).toEqual([8000]);

    undo.undo();
    expect(transitMoneyOn("a")).toHaveLength(0);
  });

  test("没设每公里成本就没有要补的", () => {
    setPlanSettings(planDoc, { cost_per_km_cents: null });
    fourBlocks();

    expect(findFuelBackfill(planDoc, library)).toEqual([]);
  });
});
