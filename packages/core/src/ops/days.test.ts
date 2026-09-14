import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { newId } from "../ids";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc, initPlanDoc } from "../schema";
import { addBase, addBlock, addExpense } from "../testing";
import {
  addDayInTz,
  deleteDay,
  insertDayAbove,
  insertDayBelow,
  moveDay,
  setDayBudget,
  setDayFlag,
  setDays,
  setDayTz,
  shiftAllDays,
} from "./days";
import { createPlanUndoManager } from "./origin";

let library: Y.Doc;
let planDoc: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
  planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p1");
});

function view() {
  return readPlan(planDoc, readLibrary(library));
}

function datesById(): Record<string, string> {
  return Object.fromEntries(view().bases.map((base) => [base.id, base.date]));
}

function block(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("blocks").get(id);
}

function base(id: string) {
  return planDoc.getMap<Y.Map<unknown>>("bases").get(id);
}

/** a = 09-24，b = 09-25，c = 09-26，都在 Asia/Shanghai */
function threeDays() {
  addBase(planDoc, "a", "2026-09-24");
  addBase(planDoc, "b", "2026-09-25");
  addBase(planDoc, "c", "2026-09-26");
}

describe("一次定下天数", () => {
  test("空计划定 3 天", () => {
    expect(setDays(planDoc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" }).ok).toBe(true);

    const bases = view().bases;
    expect(bases.map((b) => b.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(bases.map((b) => b.tz)).toEqual(["Asia/Shanghai", "Asia/Shanghai", "Asia/Shanghai"]);
  });

  test("已经有底座", () => {
    addBase(planDoc, "a", "2026-10-01");

    expect(setDays(planDoc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" })).toEqual({
      ok: false,
      error: { code: "DAYS_ALREADY_SET" },
    });
    expect(view().bases).toHaveLength(1);
  });
});

describe("向下插一天", () => {
  test("在中间插", () => {
    threeDays();
    addBlock(planDoc, "kc", { start_base_id: "c", start_minute: 600, duration_min: 60 });

    const result = insertDayBelow(planDoc, "b");

    expect(result.ok).toBe(true);
    const newId_ = result.ok ? result.value.baseId : "";
    expect(datesById()).toEqual({ a: "2026-09-24", b: "2026-09-25", [newId_]: "2026-09-26", c: "2026-09-27" });
    expect(base(newId_)?.get("tz")).toBe("Asia/Shanghai");
    expect(block("kc")?.get("start_base_id")).toBe("c");
  });
});

describe("向上插一天", () => {
  test("在中间向上插", () => {
    threeDays();

    const result = insertDayAbove(planDoc, "b");

    const newId_ = result.ok ? result.value.baseId : "";
    expect(datesById()).toEqual({ a: "2026-09-24", [newId_]: "2026-09-25", b: "2026-09-26", c: "2026-09-27" });
  });
});

describe("插入位置被块跨过时由调用方选放哪边", () => {
  test("没指定就不插", () => {
    threeDays();
    addBlock(planDoc, "k", { start_base_id: "b", start_minute: 1320, duration_min: 240 });

    expect(insertDayBelow(planDoc, "b")).toEqual({
      ok: false,
      error: { code: "CROSSING_BLOCKS", blockIds: ["k"] },
    });
    expect(view().bases).toHaveLength(3);
  });

  test("放在新那天之前", () => {
    threeDays();
    addBlock(planDoc, "k", { start_base_id: "b", start_minute: 1320, duration_min: 240 });

    expect(insertDayBelow(planDoc, "b", { crossingBlocks: "before" }).ok).toBe(true);

    expect(block("k")?.get("start_base_id")).toBe("b");
    expect(block("k")?.get("start_minute")).toBe(1320);
  });

  test("放在新那天之后", () => {
    threeDays();
    addBlock(planDoc, "k", { start_base_id: "b", start_minute: 1320, duration_min: 240 });

    const result = insertDayBelow(planDoc, "b", { crossingBlocks: "after" });

    const newId_ = result.ok ? result.value.baseId : "";
    expect(datesById()[newId_]).toBe("2026-09-26");
    expect(block("k")?.get("start_base_id")).toBe(newId_);
    expect(block("k")?.get("start_minute")).toBe(1320);
  });

  test("向上插时看的是前一天", () => {
    threeDays();
    addBlock(planDoc, "k2", { start_base_id: "a", start_minute: 1320, duration_min: 240 });

    const result = insertDayAbove(planDoc, "b", { crossingBlocks: "after" });

    const newId_ = result.ok ? result.value.baseId : "";
    expect(datesById()[newId_]).toBe("2026-09-25");
    expect(block("k2")?.get("start_base_id")).toBe(newId_);
    expect(block("k2")?.get("start_minute")).toBe(1320);
  });
});

describe("删一天", () => {
  test("其他天不动", () => {
    threeDays();
    addBlock(planDoc, "kb", { start_base_id: "b", start_minute: 600, duration_min: 60 });
    addBlock(planDoc, "kc", { start_base_id: "c", start_minute: 600, duration_min: 60 });

    expect(deleteDay(planDoc, "b").ok).toBe(true);

    expect(datesById()).toEqual({ a: "2026-09-24", c: "2026-09-26" });
    expect(planDoc.getMap("blocks").has("kb")).toBe(false);
    expect(block("kc")?.get("start_base_id")).toBe("c");
  });

  test("钱按整批规则", () => {
    threeDays();
    addBlock(planDoc, "kb1", { start_base_id: "b", start_minute: 600, duration_min: 60 });
    addBlock(planDoc, "kb2", { start_base_id: "b", start_minute: 720, duration_min: 60 });
    addBlock(planDoc, "kc", { start_base_id: "c", start_minute: 600, duration_min: 60 });
    addExpense(planDoc, "e1", { block_ids: ["kb1", "kb2"] });
    addExpense(planDoc, "e2", { block_ids: ["kb1", "kc"] });
    addExpense(planDoc, "e3", { block_ids: [] });

    deleteDay(planDoc, "b");

    const expenses = planDoc.getMap<Y.Map<unknown>>("expenses");
    expect(expenses.has("e1")).toBe(false);
    expect((expenses.get("e2")?.get("block_ids") as Y.Array<string>).toArray()).toEqual(["kc"]);
    expect(expenses.has("e3")).toBe(true);
  });

  test("撤销删天能恢复未定时顺序", () => {
    threeDays();
    base("b")?.delete("undated");
    base("b")?.set("undated", Y.Array.from(["y", "x"]));
    addBlock(planDoc, "x", { start_base_id: "b" });
    addBlock(planDoc, "y", { start_base_id: "b" });
    const undo = createPlanUndoManager(planDoc);

    deleteDay(planDoc, "b");
    undo.undo();

    expect(datesById()).toEqual({ a: "2026-09-24", b: "2026-09-25", c: "2026-09-26" });
    expect(view().undated.get("b")?.day).toEqual(["y", "x"]);
  });
});

describe("挪动某一天", () => {
  test("把第 3 天挪到最前", () => {
    threeDays();

    expect(moveDay(planDoc, "c", 0).ok).toBe(true);

    expect(datesById()).toEqual({ c: "2026-09-24", a: "2026-09-25", b: "2026-09-26" });
  });

  test("位置超出范围", () => {
    threeDays();

    expect(moveDay(planDoc, "a", 3)).toEqual({ ok: false, error: { code: "INDEX_OUT_OF_RANGE" } });
    expect(datesById()).toEqual({ a: "2026-09-24", b: "2026-09-25", c: "2026-09-26" });
  });
});

describe("整趟平移", () => {
  test("整趟推迟一周", () => {
    threeDays();
    addBlock(planDoc, "kc", { start_base_id: "c", start_minute: 600, duration_min: 60 });

    expect(shiftAllDays(planDoc, 7).ok).toBe(true);

    expect(datesById()).toEqual({ a: "2026-10-01", b: "2026-10-02", c: "2026-10-03" });
    expect(block("kc")?.get("start_base_id")).toBe("c");
  });
});

describe("改这一天的时区", () => {
  test("改成东京", () => {
    threeDays();

    expect(setDayTz(planDoc, "b", "Asia/Tokyo").ok).toBe(true);

    expect(base("b")?.get("tz")).toBe("Asia/Tokyo");
    expect(base("b")?.get("date")).toBe("2026-09-25");
  });
});

describe("同一天再加一个时区", () => {
  test("出境当天加东京", () => {
    const departure = newId();
    addBase(planDoc, departure, "2026-10-01", "Asia/Shanghai");

    const result = addDayInTz(planDoc, departure, "Asia/Tokyo");

    const added = result.ok ? result.value.baseId : "";
    const bases = view().bases;
    expect(bases.map((b) => b.id)).toEqual([departure, added]);
    expect(bases[1]).toMatchObject({ date: "2026-10-01", tz: "Asia/Tokyo" });
    expect(view().undated.get(added)).toEqual({ day: [], morning: [], afternoon: [], evening: [] });
  });

  test("时区一样", () => {
    addBase(planDoc, "a", "2026-10-01", "Asia/Shanghai");

    expect(addDayInTz(planDoc, "a", "Asia/Shanghai")).toEqual({ ok: false, error: { code: "SAME_TZ" } });
  });
});

describe("标请假或补班", () => {
  test("标请假", () => {
    threeDays();

    expect(setDayFlag(planDoc, "b", "leave").ok).toBe(true);

    expect(base("b")?.get("day_flag")).toBe("leave");
  });

  test("不认识的标记", () => {
    threeDays();

    expect(setDayFlag(planDoc, "b", "holiday" as never)).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "day_flag" },
    });
  });
});

describe("单独设这一天的时间预算", () => {
  test("只设最多开多远", () => {
    threeDays();

    expect(setDayBudget(planDoc, "b", { max_drive_km: 300 }).ok).toBe(true);

    expect(base("b")?.get("day_budget")).toEqual({ max_drive_km: 300 });
  });

  test("时间写错", () => {
    threeDays();

    expect(setDayBudget(planDoc, "b", { start: "25:00" })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "day_budget" },
    });
  });

  test("改回用默认值", () => {
    threeDays();
    setDayBudget(planDoc, "b", { max_drive_km: 300 });

    setDayBudget(planDoc, "b", null);

    expect(base("b")?.has("day_budget")).toBe(false);
  });
});
