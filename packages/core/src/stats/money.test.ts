import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock, addExpense } from "../testing";
import { fillProgress, moneySummary } from "./money";

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

function plan() {
  return readPlan(planDoc, readLibrary(library));
}

function plain(map: ReadonlyMap<string, number>): Record<string, number> {
  return Object.fromEntries(map);
}

/** 南浔两天的开销 */
function nanxunMoney() {
  planDoc.getMap("plan").set("traveler_count", 2);
  addBlock(planDoc, "drive", { start_base_id: "d1", start_minute: 540, duration_min: 180, kind_id: "transit" });
  addBlock(planDoc, "inn", { start_base_id: "d1", start_minute: 1320, duration_min: 600, kind_id: "lodging" });
  addBlock(planDoc, "xiaolz", { start_base_id: "d2", slot: "afternoon", kind_id: "sight" });
  addBlock(planDoc, "zhangsm", { start_base_id: "d2", slot: "afternoon", kind_id: "sight" });
  addExpense(planDoc, "fuel", { amount_cents: 10560, basis: "total", kind_id: "transit", block_ids: ["drive"] });
  addExpense(planDoc, "inn-fee", { amount_cents: 48000, basis: "total", kind_id: "lodging", block_ids: ["inn"] });
  addExpense(planDoc, "ticket", {
    amount_cents: 10000,
    basis: "per_person",
    kind_id: "sight",
    block_ids: ["xiaolz", "zhangsm"],
  });
  addExpense(planDoc, "insure", { amount_cents: 6000, basis: "per_person", kind_id: "other", block_ids: [] });
}

describe("一笔钱算多少", () => {
  test("人均计价乘人数", () => {
    nanxunMoney();

    expect(moneySummary(plan()).byKind.get("sight")).toBe(20000);
  });
});

describe("总额和人均", () => {
  test("范例的总额和人均", () => {
    nanxunMoney();

    const summary = moneySummary(plan());

    expect(summary.totalCents).toBe(90560);
    expect(summary.perPersonCents).toBe(45280);
  });
});

describe("按类型汇总钱", () => {
  test("范例的各类", () => {
    nanxunMoney();

    expect(plain(moneySummary(plan()).byKind)).toEqual({ transit: 10560, lodging: 48000, sight: 20000, other: 12000 });
  });

  test("0 元和没填的类别不出现", () => {
    nanxunMoney();
    addExpense(planDoc, "free", { amount_cents: 0, basis: "total", kind_id: "food" });
    addExpense(planDoc, "souvenir", { basis: "total", kind_id: "shopping" });

    const byKind = moneySummary(plan()).byKind;

    expect(byKind.has("food")).toBe(false);
    expect(byKind.has("shopping")).toBe(false);
  });
});

describe("每天花多少", () => {
  test("范例每天花多少", () => {
    nanxunMoney();

    const summary = moneySummary(plan());

    expect(plain(summary.byDay)).toEqual({ d1: 58560, d2: 20000 });
    expect(summary.unattributedCents).toBe(12000);
  });

  test("挂在两天的块上算前一天", () => {
    nanxunMoney();
    addExpense(planDoc, "extra", { amount_cents: 3000, basis: "total", kind_id: "sight", block_ids: ["zhangsm", "drive"] });

    const byDay = moneySummary(plan()).byDay;

    expect(byDay.get("d1")).toBe(61560);
    expect(byDay.get("d2")).toBe(20000);
  });
});

describe("筛选对钱的影响", () => {
  test("只看没划掉的：看开销挂的块，不挂块的不受影响", () => {
    nanxunMoney();
    planDoc.getMap<Y.Map<unknown>>("blocks").get("drive")?.set("checked", true);

    const summary = moneySummary(plan(), { onlyUnchecked: true });

    // 油费只挂在划掉的开车上：不算；民宿 48000 + 联票 20000 + 保险 12000（不挂块）
    expect(summary.byKind.has("transit")).toBe(false);
    expect(summary.totalCents).toBe(80000);
  });

  test("只看游玩类的钱", () => {
    nanxunMoney();

    const summary = moneySummary(plan(), { kindIds: ["sight"] });

    expect(plain(summary.byKind)).toEqual({ sight: 20000 });
    expect(summary.totalCents).toBe(20000);
  });
});

describe("填写进度", () => {
  test("填了多少", () => {
    for (const [id, minute] of [
      ["k1", 540],
      ["k2", 660],
      ["k3", 780],
    ] as const) {
      addBlock(planDoc, id, { start_base_id: "d1", start_minute: minute, duration_min: 60 });
    }
    addExpense(planDoc, "a", { amount_cents: 100, kind_id: "food", block_ids: ["k1"] });
    addExpense(planDoc, "b", { kind_id: "food", block_ids: [] });
    addExpense(planDoc, "c", { kind_id: "lodging", block_ids: ["k1"] });
    addExpense(planDoc, "d", { amount_cents: 50, kind_id: "sight", block_ids: [] });

    const progress = fillProgress(plan());

    expect(progress.expenseCount).toBe(4);
    expect(progress.filledCount).toBe(2);
    expect(progress.blocksWithoutMoney).toBe(2);
    expect(plain(progress.unfilledByKind)).toEqual({ food: 1, lodging: 1 });
  });
});
