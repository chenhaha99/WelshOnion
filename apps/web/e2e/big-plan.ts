import {
  addBlock,
  addExpense,
  addTag,
  createPlan,
  exportPlan,
  initLibraryDoc,
  newId,
  seedLibrary,
  setBlockLayer,
  setBlockMark,
  setBlockTag,
  setDays,
  updateBlock,
  type AddBlockInput,
} from "@welshonion/core";
import * as Y from "yjs";

const NOW = "2026-09-22T08:00:00.000Z";

/** 每天排了时间的 8 件：开始分钟、分钟数、类型、名字。「下午的景点」和「排队取号」同一时刻开始，两件并排 */
const DAY = [
  [480, 45, "food", "早饭"],
  [540, 150, "sight", "上午的景点"],
  [720, 60, "food", "午饭"],
  [810, 120, "sight", "下午的景点"],
  [810, 45, "other", "排队取号"],
  [945, 60, "shopping", "逛街"],
  [1080, 75, "food", "晚饭"],
  [1215, 90, "sight", "夜游"],
] as const;

function must<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw new Error(`造大计划失败：${JSON.stringify(result.error)}`);
  return result.value;
}

/**
 * 造一份大计划的计划文件，量「计划大了卡不卡」用：20 天、200 件事、100 笔开销。
 * 每天 8 件排了时间的事（两件并排），每晚住宿跨过午夜，每 4 天一段停留，第 3、8、13、18 天各有一件叠在上午的景点里，
 * 另有 12 件没排时间；挂标签、写备注、标待定和完成的都有一些。
 */
export function bigPlanFile(): { name: string; blockCount: number; text: string } {
  const library = new Y.Doc();
  initLibraryDoc(library);
  seedLibrary(library);
  const tagId = must(addTag(library, { name: "必去", color: "#d9822b" })).tagId;

  const plan = new Y.Doc();
  const name = "大计划：二十天";
  must(createPlan(library, plan, { planId: newId(), name, now: NOW }));
  const baseIds = must(setDays(plan, { startDate: "2026-10-01", count: 20, tz: "Asia/Shanghai" })).baseIds;
  let blockCount = 0;
  const add = (input: AddBlockInput) => {
    blockCount += 1;
    return must(addBlock(plan, library, input)).blockId;
  };

  const days: string[][] = [];
  const lodgings: string[] = [];
  baseIds.forEach((baseId, d) => {
    if (d % 4 === 0) add({ baseId, kindId: "stay", title: `第 ${d / 4 + 1} 站`, minute: 0, duration: 4 * 1440 });
    const ids = DAY.map(([minute, duration, kindId, title]) => add({ baseId, kindId, title: `${title} ${d + 1}`, minute, duration }));
    days.push(ids);
    if (d % 5 === 2) {
      const nested = add({ baseId, kindId: "sight", title: `跟讲解 ${d + 1}`, minute: 570, duration: 60 });
      must(setBlockLayer(plan, library, nested, ids[1]!));
    }
    if (d < baseIds.length - 1) lodgings.push(add({ baseId, kindId: "lodging", title: `酒店 ${d + 1}`, minute: 1320, duration: 600 }));
    if (d % 5 < 3) add({ baseId, kindId: "other", title: `备选 ${d + 1}`, slot: "day" });
  });

  // 开销 100 笔：19 晚房费，每天上午、下午的景点门票和午饭、晚饭，外加两笔不挂事的
  lodgings.forEach((id) => must(addExpense(plan, library, { title: "房费", amountCents: 50_000, blockIds: [id] })));
  const paid = days.flatMap((ids) => [ids[1]!, ids[3]!, ids[2]!, ids[6]!]).slice(0, 79);
  paid.forEach((id, i) => must(addExpense(plan, library, { title: i % 2 ? "吃饭" : "门票", amountCents: 8_000 + i * 100, blockIds: [id] })));
  must(addExpense(plan, library, { title: "旅游保险", amountCents: 9_900 }));
  must(addExpense(plan, library, { title: "流量卡", amountCents: 5_000 }));

  const mains = days.flat();
  must(setBlockTag(plan, library, mains.filter((_, i) => i % 7 === 1), tagId, true));
  must(setBlockMark(plan, mains.filter((_, i) => i % 11 === 3), "pending"));
  must(setBlockMark(plan, mains.filter((_, i) => i % 16 === 7), "done"));
  mains.filter((_, i) => i % 6 === 3).forEach((id) => must(updateBlock(plan, library, id, { note: "要提前预约，带身份证" })));

  return { name, blockCount, text: exportPlan(library, plan, NOW) };
}
