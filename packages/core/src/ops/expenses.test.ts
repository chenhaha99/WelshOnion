import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock as seedBlock } from "../testing";
import { addExpense, deleteExpense, linkExpense, unlinkExpense, updateExpense } from "./expenses";

let library: Y.Doc;
let planDoc: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p1");
  addBase(planDoc, "d1", "2026-10-01");
  seedBlock(planDoc, "k1", { start_base_id: "d1", start_minute: 540, duration_min: 60, kind_id: "lodging" });
  seedBlock(planDoc, "k2", { start_base_id: "d1", start_minute: 660, duration_min: 60, kind_id: "sight" });
});

function expense(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("expenses").get(id);
}

function linked(id: string): string[] {
  return (expense(id)?.get("block_ids") as Y.Array<string>).toArray();
}

function create(input: Parameters<typeof addExpense>[2]): string {
  const result = addExpense(planDoc, library, input);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.expenseId;
}

describe("新增一笔钱", () => {
  test("挂在一个块上、不给类型", () => {
    const id = create({ title: "民宿 1 晚", amountCents: 48000, blockIds: ["k1"] });

    expect(expense(id)?.toJSON()).toEqual({
      title: "民宿 1 晚",
      amount_cents: 48000,
      currency: "CNY",
      basis: "total",
      kind_id: "lodging",
      block_ids: ["k1"],
      created_by: "me",
    });
  });

  test("不挂块的钱", () => {
    const id = create({ title: "出行保险", amountCents: 6000, basis: "per_person" });

    expect(expense(id)?.get("kind_id")).toBe("other");
    expect(linked(id)).toEqual([]);
    expect(expense(id)?.get("basis")).toBe("per_person");
  });

  test("金额先空着", () => {
    const id = create({ title: "门票" });

    expect(expense(id)?.has("amount_cents")).toBe(false);
  });

  test("金额不是整数分", () => {
    expect(addExpense(planDoc, library, { title: "x", amountCents: 3.5 })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "amount_cents" },
    });
    expect(planDoc.getMap("expenses").size).toBe(0);
  });

  test("挂的块不存在", () => {
    expect(addExpense(planDoc, library, { title: "x", blockIds: ["gone"] })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", id: "gone" },
    });
  });
});

describe("修改一笔钱", () => {
  test("填上金额并改类型", () => {
    const id = create({ title: "吃饭", amountCents: 100, blockIds: ["k2"] });

    expect(updateExpense(planDoc, library, id, { amount_cents: 350, kind_id: "food" }).ok).toBe(true);

    expect(expense(id)?.get("amount_cents")).toBe(350);
    expect(expense(id)?.get("kind_id")).toBe("food");
  });

  test("清空金额", () => {
    const id = create({ title: "吃饭", amountCents: 100 });

    updateExpense(planDoc, library, id, { amount_cents: null });

    expect(expense(id)?.has("amount_cents")).toBe(false);
  });
});

describe("把钱挂到另一个块", () => {
  test("一笔钱挂两段", () => {
    const id = create({ title: "房费", blockIds: ["k1"] });

    expect(linkExpense(planDoc, id, "k2").ok).toBe(true);

    expect(linked(id)).toEqual(["k1", "k2"]);
  });

  test("重复挂不会挂两次", () => {
    const id = create({ title: "房费", blockIds: ["k1"] });

    linkExpense(planDoc, id, "k1");

    expect(linked(id)).toEqual(["k1"]);
  });
});

describe("解除一个块的关联", () => {
  test("解除后钱还在", () => {
    const id = create({ title: "通票", blockIds: ["k1", "k2"] });

    unlinkExpense(planDoc, id, "k1");
    expect(linked(id)).toEqual(["k2"]);

    unlinkExpense(planDoc, id, "k2");
    expect(linked(id)).toEqual([]);
    expect(expense(id)).toBeDefined();
  });
});

describe("删掉一笔钱", () => {
  test("删掉", () => {
    const id = create({ title: "通票" });

    expect(deleteExpense(planDoc, id).ok).toBe(true);

    expect(planDoc.getMap("expenses").has(id)).toBe(false);
  });
});
