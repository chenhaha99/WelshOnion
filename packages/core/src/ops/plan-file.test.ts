import * as Y from "yjs";
import { describe, expect, test } from "vitest";
import { readLibrary, readPlan } from "../read";
import { initLibraryDoc } from "../schema";
import { addBlock, setBlockStatus, updateBlock, type AddBlockInput } from "./blocks";
import { setDayFlag, setDays } from "./days";
import { setBlockLayer } from "./drag";
import { addExpense } from "./expenses";
import { updateKind } from "./library";
import { createPlanUndoManager } from "./origin";
import { createPlan } from "./plan";
import { exportPlan, importPlan, parsePlanFile, type PlanFile } from "./plan-file";

const EXPORTED = "2026-09-15T08:00:00.000Z";
const IMPORTED = "2026-09-16T09:00:00.000Z";

function newLibrary(): Y.Doc {
  const library = new Y.Doc();
  initLibraryDoc(library);
  return library;
}

/** 直接写一条自定义类型、状态、地点，好指定 id 和顺序。 */
function putKind(library: Y.Doc, id: string, name: string, color: string, order: number, layer = 2) {
  library.getMap("kinds").set(
    id,
    new Y.Map<unknown>([
      ["name", name],
      ["color", color],
      ["layer", layer],
      ["builtin", false],
      ["order", order],
    ]),
  );
}

function putStatus(library: Y.Doc, id: string, name: string, color: string, order: number) {
  library.getMap("statuses").set(
    id,
    new Y.Map<unknown>([
      ["name", name],
      ["color", color],
      ["builtin", false],
      ["order", order],
    ]),
  );
}

function putPlace(library: Y.Doc, id: string, name: string, poiId: string | null) {
  library.getMap("places").set(
    id,
    new Y.Map<unknown>([
      ["name", name],
      ["lat", 30.25],
      ["lng", 120.14],
      ["providers", new Y.Map<unknown>(poiId === null ? [] : [["amap", { poi_id: poiId }]])],
    ]),
  );
}

/** 计划 p1「关西 10 天」：10-01 起 3 天。 */
function newPlan(library: Y.Doc) {
  const planDoc = new Y.Doc();
  createPlan(library, planDoc, { planId: "p1", name: "关西 10 天", now: EXPORTED });
  const days = setDays(planDoc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  return { planDoc, baseIds: days.value.baseIds };
}

function block(planDoc: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(planDoc, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function exportAndParse(library: Y.Doc, planDoc: Y.Doc): PlanFile {
  const parsed = parsePlanFile(exportPlan(library, planDoc, EXPORTED));
  if (!parsed.ok) throw new Error("读文件失败");
  return parsed.value;
}

describe("导出一个计划", () => {
  test("只放用到的类型、状态、地点，不放计划索引", () => {
    const library = newLibrary();
    putKind(library, "k-work", "工作", "#8a9bb5", 100);
    putKind(library, "k-hike", "徒步", "#9aa7c7", 101);
    putStatus(library, "s-booked", "已订", "#6f9a82", 100);
    const { planDoc, baseIds } = newPlan(library);
    const meeting = block(planDoc, library, {
      baseId: baseIds[0]!,
      kindId: "k-work",
      statusId: "s-booked",
      title: "开会",
      minute: 540,
      duration: 60,
    });
    addExpense(planDoc, library, { title: "午饭", amountCents: 5000, kindId: "food", blockIds: [meeting] });

    const file = JSON.parse(exportPlan(library, planDoc, EXPORTED));

    expect(Object.keys(file)).toEqual(["format", "version", "exported_at", "plan", "library"]);
    expect(file).toMatchObject({ format: "welshonion-plan", version: 1, exported_at: EXPORTED });
    expect(Object.keys(file.library)).toEqual(["kinds", "statuses", "places"]);
    expect(file.library.kinds.map((kind: { id: string }) => kind.id)).toEqual(["food", "k-work"]);
    expect(file.library.kinds[1]).toEqual({ id: "k-work", name: "工作", color: "#8a9bb5", layer: 2, order: 100 });
    expect(file.library.statuses).toEqual([{ id: "s-booked", name: "已订", color: "#6f9a82", order: 100 }]);
    expect(file.library.places).toEqual([]);
  });

  test("计划原样在里面", () => {
    const library = newLibrary();
    const { planDoc, baseIds } = newPlan(library);
    block(planDoc, library, { baseId: baseIds[1]!, kindId: "sight", title: "西湖", minute: 540, duration: 120 });

    const decoded = new Y.Doc();
    Y.applyUpdate(decoded, exportAndParse(library, planDoc).plan);

    const original = readPlan(planDoc, readLibrary(library));
    const copy = readPlan(decoded, readLibrary(library));
    expect(copy.plan.name).toBe("关西 10 天");
    expect(copy.bases).toEqual(original.bases);
    expect([...copy.blocks.values()]).toEqual([...original.blocks.values()]);
    expect([...copy.expenses.values()]).toEqual([...original.expenses.values()]);
  });
});

describe("读文件", () => {
  const NOT_PLAN = { ok: false, error: { code: "FILE_NOT_PLAN" } };
  const TOO_NEW = { ok: false, error: { code: "FILE_TOO_NEW" } };

  test("不是计划文件", () => {
    expect(parsePlanFile('{"hello": 1}')).toEqual(NOT_PLAN);
    expect(parsePlanFile("这不是 JSON")).toEqual(NOT_PLAN);
  });

  test("计划那一段解不开，或者解出来不是计划", () => {
    const library = newLibrary();
    const { planDoc } = newPlan(library);
    const file = JSON.parse(exportPlan(library, planDoc, EXPORTED));

    expect(parsePlanFile(JSON.stringify({ ...file, plan: "不是编码" }))).toEqual(NOT_PLAN);
    expect(parsePlanFile(exportPlan(library, new Y.Doc(), EXPORTED))).toEqual(NOT_PLAN);
  });

  test("来自更新的版本", () => {
    const library = newLibrary();
    const { planDoc } = newPlan(library);
    const file = JSON.parse(exportPlan(library, planDoc, EXPORTED));

    expect(parsePlanFile(JSON.stringify({ ...file, version: 2 }))).toEqual(TOO_NEW);

    planDoc.getMap("meta").set("schema", 2);
    expect(parsePlanFile(exportPlan(library, planDoc, EXPORTED))).toEqual(TOO_NEW);
  });

  test("条目不合法", () => {
    const library = newLibrary();
    putKind(library, "k-work", "工作", "#8a9bb5", 100);
    const { planDoc, baseIds } = newPlan(library);
    block(planDoc, library, { baseId: baseIds[0]!, kindId: "k-work", title: "开会", minute: 540, duration: 60 });
    const file = JSON.parse(exportPlan(library, planDoc, EXPORTED));
    file.library.kinds = file.library.kinds.map((kind: { id: string }) =>
      kind.id === "k-work" ? { ...kind, color: "blue" } : kind,
    );

    expect(parsePlanFile(JSON.stringify(file))).toEqual(NOT_PLAN);
  });

  test("读出计划 id 和名字", () => {
    const library = newLibrary();
    const { planDoc } = newPlan(library);

    const file = exportAndParse(library, planDoc);

    expect([file.planId, file.name]).toEqual(["p1", "关西 10 天"]);
  });
});

describe("导入到新的计划文档", () => {
  /** 10.2：已确认的「西湖」备注「带伞」挂 30000 分门票，「明清宫苑」叠在「横店」上；10.1 上午两件没排时间的事；10.3 请假。 */
  function kansai() {
    const library = newLibrary();
    const { planDoc, baseIds } = newPlan(library);
    const [oct1, oct2, oct3] = baseIds;
    const lake = block(planDoc, library, { baseId: oct2!, kindId: "sight", title: "西湖", minute: 540, duration: 120 });
    setBlockStatus(planDoc, library, [lake], "confirmed");
    updateBlock(planDoc, library, lake, { note: "带伞" });
    addExpense(planDoc, library, { title: "门票", amountCents: 30000, blockIds: [lake] });
    const hengdian = block(planDoc, library, { baseId: oct2!, kindId: "sight", title: "横店", minute: 780, duration: 300 });
    const palace = block(planDoc, library, { baseId: oct2!, kindId: "sight", title: "明清宫苑", minute: 840, duration: 60 });
    setBlockLayer(planDoc, library, palace, hengdian);
    block(planDoc, library, { baseId: oct1!, kindId: "food", title: "早茶", slot: "morning" });
    block(planDoc, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "morning" });
    setDayFlag(planDoc, oct3!, "leave");
    return { library, planDoc };
  }

  test("原样还原，换计划 id，写计划索引", () => {
    const { library, planDoc } = kansai();
    const file = exportAndParse(library, planDoc);
    const otherLibrary = newLibrary();
    const target = new Y.Doc();

    expect(importPlan(otherLibrary, target, file, { planId: "p9", now: IMPORTED }).ok).toBe(true);

    const original = readPlan(planDoc, readLibrary(library));
    const imported = readPlan(target, readLibrary(otherLibrary));
    expect(imported.planId).toBe("p9");
    expect(imported.plan).toEqual(original.plan);
    expect(imported.bases).toEqual(original.bases);
    expect([...imported.blocks.values()]).toEqual([...original.blocks.values()]);
    expect([...imported.expenses.values()]).toEqual([...original.expenses.values()]);
    expect([...imported.undated.entries()]).toEqual([...original.undated.entries()]);
    expect(readLibrary(otherLibrary).planIndex.get("p9")).toMatchObject({
      name: "关西 10 天",
      day_count: 3,
      last_opened_at: IMPORTED,
    });
  });

  test("换名字", () => {
    const { library, planDoc } = kansai();
    const otherLibrary = newLibrary();
    const target = new Y.Doc();

    importPlan(otherLibrary, target, exportAndParse(library, planDoc), {
      planId: "p9",
      name: "关西 10 天（导入）",
      now: IMPORTED,
    });

    expect(readPlan(target, readLibrary(otherLibrary)).plan.name).toBe("关西 10 天（导入）");
    expect(readLibrary(otherLibrary).planIndex.get("p9")?.name).toBe("关西 10 天（导入）");
  });

  test("导入不进撤销", () => {
    const { library, planDoc } = kansai();
    const target = new Y.Doc();
    const undo = createPlanUndoManager(target);

    importPlan(newLibrary(), target, exportAndParse(library, planDoc), { planId: "p9", now: IMPORTED });

    expect(undo.canUndo()).toBe(false);
  });
});

describe("导入时合并资料库", () => {
  /** 在源资料库里建好条目、计划里用上，导出再读回来。 */
  function fileUsing(prepare: (library: Y.Doc) => void, use: (planDoc: Y.Doc, library: Y.Doc, dayId: string) => void): PlanFile {
    const library = newLibrary();
    prepare(library);
    const { planDoc, baseIds } = newPlan(library);
    use(planDoc, library, baseIds[0]!);
    return exportAndParse(library, planDoc);
  }

  function importInto(local: Y.Doc, file: PlanFile) {
    const target = new Y.Doc();
    const result = importPlan(local, target, file, { planId: "p9", now: IMPORTED });
    if (!result.ok) throw new Error("导入失败");
    return readPlan(target, readLibrary(local));
  }

  const onlyBlock = (view: ReturnType<typeof importInto>) => [...view.blocks.values()][0]!;

  test("类型按名字合并，保留本机的颜色；块和钱都改用本机的 id", () => {
    const file = fileUsing(
      (library) => putKind(library, "k-a", "工作", "#8a9bb5", 100),
      (planDoc, library, dayId) => {
        const meeting = block(planDoc, library, { baseId: dayId, kindId: "k-a", title: "开会", minute: 540, duration: 60 });
        addExpense(planDoc, library, { title: "打车", amountCents: 3000, kindId: "k-a", blockIds: [meeting] });
      },
    );
    const local = newLibrary();
    putKind(local, "k-b", "工作", "#6f9a82", 100);
    const kindCount = readLibrary(local).kinds.size;

    const imported = importInto(local, file);

    expect(readLibrary(local).kinds.size).toBe(kindCount);
    expect(readLibrary(local).kinds.get("k-b")?.color).toBe("#6f9a82");
    expect(onlyBlock(imported).kind.id).toBe("k-b");
    expect([...imported.expenses.values()][0]?.kind.id).toBe("k-b");
  });

  test("本机有几条同名的，取排序最靠前的", () => {
    const file = fileUsing(
      (library) => putKind(library, "k-a", "工作", "#8a9bb5", 100),
      (planDoc, library, dayId) => {
        block(planDoc, library, { baseId: dayId, kindId: "k-a", title: "开会", minute: 540, duration: 60 });
      },
    );
    const local = newLibrary();
    putKind(local, "k-c", "工作", "#aa8866", 102);
    putKind(local, "k-b", "工作", "#6f9a82", 101);

    expect(onlyBlock(importInto(local, file)).kind.id).toBe("k-b");
  });

  test("类型对不上就新建：沿用文件里的 id、名字、颜色、层，排在最后", () => {
    const file = fileUsing(
      (library) => putKind(library, "k-a", "工作", "#8a9bb5", 100, 1),
      (planDoc, library, dayId) => {
        block(planDoc, library, { baseId: dayId, kindId: "k-a", title: "开会", minute: 540, duration: 60 });
      },
    );
    const local = newLibrary();

    const imported = importInto(local, file);

    const kinds = readLibrary(local).kinds;
    expect(kinds.get("k-a")).toMatchObject({ name: "工作", color: "#8a9bb5", layer: 1, builtin: false });
    const others = [...kinds.values()].filter((kind) => kind.id !== "k-a");
    expect(kinds.get("k-a")!.order).toBeGreaterThan(Math.max(...others.map((kind) => kind.order)));
    expect(onlyBlock(imported).kind.id).toBe("k-a");
  });

  test("状态对不上就新建：沿用文件里的 id，排在最后", () => {
    const file = fileUsing(
      (library) => putStatus(library, "s-a", "已订", "#6f9a82", 100),
      (planDoc, library, dayId) => {
        block(planDoc, library, { baseId: dayId, kindId: "sight", statusId: "s-a", title: "西湖", minute: 540, duration: 60 });
      },
    );
    const local = newLibrary();

    const imported = importInto(local, file);

    const statuses = readLibrary(local).statuses;
    expect(statuses.get("s-a")).toMatchObject({ name: "已订", color: "#6f9a82", builtin: false });
    const others = [...statuses.values()].filter((status) => status.id !== "s-a");
    expect(statuses.get("s-a")!.order).toBeGreaterThan(Math.max(...others.map((status) => status.order)));
    expect(onlyBlock(imported).status.id).toBe("s-a");
  });

  test("状态按名字合并", () => {
    const file = fileUsing(
      (library) => putStatus(library, "s-a", "已订", "#8a9bb5", 100),
      (planDoc, library, dayId) => {
        block(planDoc, library, { baseId: dayId, kindId: "sight", statusId: "s-a", title: "西湖", minute: 540, duration: 60 });
      },
    );
    const local = newLibrary();
    putStatus(local, "s-b", "已订", "#6f9a82", 100);

    const imported = importInto(local, file);

    expect(readLibrary(local).statuses.has("s-a")).toBe(false);
    expect(readLibrary(local).statuses.get("s-b")?.color).toBe("#6f9a82");
    expect(onlyBlock(imported).status.id).toBe("s-b");
  });

  test("预设按 id：本机改过的名字不动，不多出一条", () => {
    const file = fileUsing(
      () => {},
      (planDoc, library, dayId) => {
        block(planDoc, library, { baseId: dayId, kindId: "food", title: "早茶", minute: 480, duration: 60 });
      },
    );
    const local = newLibrary();
    updateKind(local, "food", { name: "吃饭" });
    const kindCount = readLibrary(local).kinds.size;

    const imported = importInto(local, file);

    expect(readLibrary(local).kinds.get("food")?.name).toBe("吃饭");
    expect(readLibrary(local).kinds.size).toBe(kindCount);
    expect(onlyBlock(imported).kind.id).toBe("food");
  });

  test("地点按 poi_id 合并，不按名字", () => {
    const file = fileUsing(
      (library) => {
        putPlace(library, "pl-home", "家", "B001");
        putPlace(library, "pl-hotel", "酒店", null);
      },
      (planDoc, library, dayId) => {
        const trip = block(planDoc, library, { baseId: dayId, kindId: "transit", title: "回家", minute: 1080, duration: 60 });
        updateBlock(planDoc, library, trip, { place_ids: ["pl-home", "pl-hotel"] });
      },
    );
    const local = newLibrary();
    putPlace(local, "pl-mine", "我家", "B001");
    putPlace(local, "pl-local-hotel", "酒店", null);

    const imported = importInto(local, file);

    expect(onlyBlock(imported).place_ids).toEqual(["pl-mine", "pl-hotel"]);
    const places = [...readLibrary(local).places.values()];
    expect(places.filter((place) => place.name === "酒店").map((place) => place.id).sort()).toEqual([
      "pl-hotel",
      "pl-local-hotel",
    ]);
    expect(places.some((place) => place.id === "pl-home")).toBe(false);
  });

  test("同一个文件导两次：都按 id 对上，资料库不再变多", () => {
    const file = fileUsing(
      (library) => {
        putKind(library, "k-a", "工作", "#8a9bb5", 100);
        putStatus(library, "s-a", "已订", "#6f9a82", 100);
        putPlace(library, "pl-a", "酒店", null);
      },
      (planDoc, library, dayId) => {
        const meeting = block(planDoc, library, {
          baseId: dayId,
          kindId: "k-a",
          statusId: "s-a",
          title: "开会",
          minute: 540,
          duration: 60,
        });
        updateBlock(planDoc, library, meeting, { place_ids: ["pl-a"] });
      },
    );
    const local = newLibrary();
    const sizes = () => {
      const view = readLibrary(local);
      return [view.kinds.size, view.statuses.size, view.places.size];
    };

    importInto(local, file);
    const afterFirst = sizes();
    importInto(local, file);

    expect(sizes()).toEqual(afterFirst);
  });
});
