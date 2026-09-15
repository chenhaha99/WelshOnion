import * as Y from "yjs";
import { newId } from "../ids";
import { followersOf, layerWhenOnto } from "../nesting";
import {
  readLibrary,
  readPlan,
  type LibraryView,
  type PlanView,
  type Slot,
  type TransportMode,
  type UndatedGroups,
} from "../read";
import type { ValidatedField } from "../validate";
import { attachFuel, hasTransitMoney, qualifiesForFuel } from "./fuel";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, firstInvalidField, ok, type OpResult } from "./result";
import { removeBlocks } from "./remove";
import { setOrDelete } from "./write";

type YMap = Y.Map<unknown>;
type Checks = Array<readonly [ValidatedField, unknown]>;

/** 操作参数里的格子：「整天」用显式的 day，存的时候就是不写 slot。 */
export type SlotChoice = Slot | "day";

/** auto：不是拖拽时用，没有可保留的层就放旁边；beside：放旁边；onto：叠到某块上。 */
export type Placement = "auto" | "beside" | "onto";

/** 排上时间：坐到哪天（不给就是原来那天）、第几分钟、多长，怎么放。 */
interface TimedOptions {
  baseId?: string;
  minute: number;
  duration: number;
  placement?: Placement;
  ontoBlockId?: string;
}

interface BlockBasics {
  baseId: string;
  kindId: string;
  title: string;
  statusId?: string;
  placeIds?: string[];
  subtitle?: string;
  createdBy?: string;
}

export type AddBlockInput = BlockBasics &
  ({ minute: number; duration: number } | { slot: SlotChoice; duration?: number });

export interface BlockPatch {
  title?: string;
  subtitle?: string | null;
  kind_id?: string;
  place_ids?: string[];
  transport_mode?: TransportMode | null;
  distance_m?: number | null;
  note?: string | null;
}

export function addBlock(planDoc: Y.Doc, library: Y.Doc, input: AddBlockInput): OpResult<{ blockId: string }> {
  const checks: Checks =
    "minute" in input
      ? [
          ["start_minute", input.minute],
          ["duration_min", input.duration],
        ]
      : [
          ["slot", slotValue(input.slot)],
          ["duration_min", input.duration ?? null],
        ];
  const invalid = firstInvalidField(checks);
  if (invalid) return fail(invalid);
  const base = basesOf(planDoc).get(input.baseId);
  if (!base) return fail({ code: "NOT_FOUND", id: input.baseId });
  const statusId = input.statusId ?? "pending";
  const missing = missingInLibrary(library, { kindId: input.kindId, statusId });
  if (missing) return fail({ code: "NOT_FOUND", id: missing });

  const blockId = newId();
  planDoc.transact(() => {
    const block = new Y.Map<unknown>();
    blocksOf(planDoc).set(blockId, block);
    block.set("start_base_id", input.baseId);
    block.set("kind_id", input.kindId);
    block.set("status_id", statusId);
    block.set("title", input.title);
    block.set("created_by", input.createdBy ?? "me");
    block.set("place_ids", Y.Array.from(input.placeIds ?? []));
    if (input.subtitle !== undefined) block.set("subtitle", input.subtitle);
    if ("minute" in input) {
      block.set("start_minute", input.minute);
      block.set("duration_min", input.duration);
    } else {
      setOrDelete(block, "slot", slotValue(input.slot));
      if (input.duration !== undefined) block.set("duration_min", input.duration);
      undatedOf(base).push([blockId]);
    }
  }, LOCAL_ORIGIN);
  return ok({ blockId });
}

export function updateBlock(planDoc: Y.Doc, library: Y.Doc, blockId: string, patch: BlockPatch): OpResult {
  const checks: Checks = [];
  if (patch.transport_mode !== undefined) checks.push(["transport_mode", patch.transport_mode]);
  if (patch.distance_m !== undefined) checks.push(["distance_m", patch.distance_m]);
  const invalid = firstInvalidField(checks);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  if (patch.kind_id !== undefined) {
    const missing = missingInLibrary(library, { kindId: patch.kind_id });
    if (missing) return fail({ code: "NOT_FOUND", id: missing });
  }

  // 自驾油费：「自驾、有距离、设了每公里成本」这次刚凑齐、块上还没有交通类的钱，就在同一步里挂上
  const cost = planDoc.getMap("plan").get("cost_per_km_cents");
  const modeAfter = patch.transport_mode !== undefined ? patch.transport_mode : block.get("transport_mode");
  const distanceAfter = patch.distance_m !== undefined ? patch.distance_m : block.get("distance_m");
  const shouldAttachFuel =
    !qualifiesForFuel(block.get("transport_mode"), block.get("distance_m"), cost) &&
    qualifiesForFuel(modeAfter, distanceAfter, cost) &&
    !hasTransitMoney(planDoc, blockId);

  planDoc.transact(() => {
    for (const key of ["title", "subtitle", "kind_id", "transport_mode", "distance_m"] as const) {
      const value = patch[key];
      if (value !== undefined) setOrDelete(block, key, value);
    }
    if (patch.place_ids !== undefined) {
      // 在原数组里删光再插入：别人同时挂上的地点能合并进来，换成新数组对象就会丢
      const placeIds = block.get("place_ids") as Y.Array<string>;
      placeIds.delete(0, placeIds.length);
      placeIds.insert(0, patch.place_ids);
    }
    if (patch.note === null) {
      block.delete("note");
    } else if (patch.note !== undefined) {
      const note = new Y.Text();
      note.insert(0, patch.note);
      block.set("note", note);
    }
    if (shouldAttachFuel) attachFuel(planDoc, blockId, distanceAfter as number, cost as number);
  }, LOCAL_ORIGIN);
  return done();
}

/** 只改这个块的时长，套在里面的块不动。 */
export function resizeBlock(planDoc: Y.Doc, blockId: string, duration: number): OpResult {
  const invalid = firstInvalidField([["duration_min", duration]]);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  planDoc.transact(() => block.set("duration_min", duration), LOCAL_ORIGIN);
  return done();
}

/** 删掉这个块和它会带走的块，钱按整批规则处理。 */
export function deleteBlock(planDoc: Y.Doc, library: Y.Doc, blockId: string): OpResult {
  if (!blocksOf(planDoc).has(blockId)) return fail({ code: "NOT_FOUND", id: blockId });
  const libraryView = readLibrary(library);
  const removing = [blockId, ...followersOf(readPlan(planDoc, libraryView), libraryView, blockId)];

  planDoc.transact(() => {
    removeFromAllUndated(planDoc, removing);
    removeBlocks(planDoc, removing);
  }, LOCAL_ORIGIN);
  return done();
}

export function setBlockStatus(
  planDoc: Y.Doc,
  library: Y.Doc,
  blockIds: readonly string[],
  statusId: string,
): OpResult {
  const missing = missingInLibrary(library, { statusId });
  if (missing) return fail({ code: "NOT_FOUND", id: missing });
  const blocks = blocksOf(planDoc);
  const absent = blockIds.find((id) => !blocks.has(id));
  if (absent !== undefined) return fail({ code: "NOT_FOUND", id: absent });

  planDoc.transact(() => {
    for (const id of blockIds) {
      blocks.get(id)?.set("status_id", statusId);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 只对未定时块有效。 */
export function setBlockIndent(planDoc: Y.Doc, blockId: string, indent: number | null): OpResult {
  const invalid = firstInvalidField([["indent", indent]]);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  if (block.has("start_minute")) return fail({ code: "NOT_UNDATED" });
  planDoc.transact(() => setOrDelete(block, "indent", indent), LOCAL_ORIGIN);
  return done();
}

/** 变成未定时块：去掉时间、层、缩进，写上格子，插到这天排序里 beforeId 前面（没有就放最后）。 */
export function setBlockUndated(
  planDoc: Y.Doc,
  blockId: string,
  options: { baseId?: string; slot: SlotChoice; beforeId?: string },
): OpResult {
  const invalid = firstInvalidField([["slot", slotValue(options.slot)]]);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  const baseId = options.baseId ?? (block.get("start_base_id") as string);
  const base = basesOf(planDoc).get(baseId);
  if (!base) return fail({ code: "NOT_FOUND", id: baseId });

  planDoc.transact(() => {
    block.set("start_base_id", baseId);
    for (const key of ["start_minute", "layer", "indent"]) {
      block.delete(key);
    }
    setOrDelete(block, "slot", slotValue(options.slot));
    removeFromAllUndated(planDoc, [blockId]);
    insertIntoUndated(base, blockId, options.beforeId);
  }, LOCAL_ORIGIN);
  return done();
}

/** 排上时间：写开始分钟和时长，去掉格子和缩进，移出排序；层按放法算（不从缩进推嵌套）。 */
export function setBlockTimed(
  planDoc: Y.Doc,
  library: Y.Doc,
  blockId: string,
  options: TimedOptions,
): OpResult {
  const invalid = firstInvalidField([
    ["start_minute", options.minute],
    ["duration_min", options.duration],
  ]);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  const baseId = options.baseId ?? (block.get("start_base_id") as string);
  if (!basesOf(planDoc).has(baseId)) return fail({ code: "NOT_FOUND", id: baseId });

  let layer: number | null = null;
  if (options.placement === "onto" && options.ontoBlockId !== undefined) {
    const libraryView = readLibrary(library);
    layer = timedLayer(readPlan(planDoc, libraryView), libraryView, blockId, options);
  }

  planDoc.transact(() => {
    block.set("start_base_id", baseId);
    block.set("start_minute", options.minute);
    block.set("duration_min", options.duration);
    block.delete("slot");
    block.delete("indent");
    setOrDelete(block, "layer", layer);
    removeFromAllUndated(planDoc, [blockId]);
  }, LOCAL_ORIGIN);
  return done();
}

/**
 * 松手前算出排上时间以后这个块是什么样，不改文档：底座、分钟、时长、层和 setBlockTimed 写进去再读出来的一样，
 * 也不再在没排时间的排序里。给时间轴从「没排时间」栏拖出来时画松手后的样子用。
 */
export function previewSetBlockTimed(
  plan: PlanView,
  library: LibraryView,
  blockId: string,
  options: TimedOptions,
): OpResult<PlanView> {
  const invalid = firstInvalidField([
    ["start_minute", options.minute],
    ["duration_min", options.duration],
  ]);
  if (invalid) return fail(invalid);
  const block = plan.blocks.get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  const baseId = options.baseId ?? block.start_base_id;
  if (!plan.bases.some((base) => base.id === baseId)) return fail({ code: "NOT_FOUND", id: baseId });

  const blocks = new Map(plan.blocks).set(blockId, {
    ...block,
    start_base_id: baseId,
    start_minute: options.minute,
    duration_min: options.duration,
    slot: null,
    indent: null,
    layer: timedLayer(plan, library, blockId, options),
  });
  const undated = new Map([...plan.undated].map(([id, groups]) => [id, withoutBlock(groups, blockId)]));
  return ok({ ...plan, blocks, undated });
}

/** 排上时间时存的层：叠上去按「叠上去时的层」算，别的放法不存（不从缩进推嵌套）。 */
function timedLayer(plan: PlanView, library: LibraryView, blockId: string, options: TimedOptions): number | null {
  if (options.placement !== "onto" || options.ontoBlockId === undefined) return null;
  const dragged = plan.blocks.get(blockId);
  return dragged ? layerWhenOnto(plan, library, dragged, options.ontoBlockId) : null;
}

function withoutBlock(groups: UndatedGroups, blockId: string): UndatedGroups {
  const keep = (ids: readonly string[]) => ids.filter((id) => id !== blockId);
  return { day: keep(groups.day), morning: keep(groups.morning), afternoon: keep(groups.afternoon), evening: keep(groups.evening) };
}

/** 只对未定时块有效：写上格子，在这天排序里挪到 beforeId 前面（没有就放最后）。 */
export function moveUndated(
  planDoc: Y.Doc,
  blockId: string,
  options: { slot: SlotChoice; beforeId?: string },
): OpResult {
  const invalid = firstInvalidField([["slot", slotValue(options.slot)]]);
  if (invalid) return fail(invalid);
  const block = blocksOf(planDoc).get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  if (block.has("start_minute")) return fail({ code: "NOT_UNDATED" });
  const baseId = block.get("start_base_id") as string;
  const base = basesOf(planDoc).get(baseId);
  if (!base) return fail({ code: "NOT_FOUND", id: baseId });

  planDoc.transact(() => {
    setOrDelete(block, "slot", slotValue(options.slot));
    removeFromAllUndated(planDoc, [blockId]);
    insertIntoUndated(base, blockId, options.beforeId);
  }, LOCAL_ORIGIN);
  return done();
}

function slotValue(slot: SlotChoice): Slot | null {
  return slot === "day" ? null : slot;
}

function missingInLibrary(library: Y.Doc, ids: { kindId?: string; statusId?: string }): string | null {
  if (ids.kindId !== undefined && !library.getMap("kinds").has(ids.kindId)) return ids.kindId;
  if (ids.statusId !== undefined && !library.getMap("statuses").has(ids.statusId)) return ids.statusId;
  return null;
}

function removeFromAllUndated(planDoc: Y.Doc, blockIds: readonly string[]): void {
  const removing = new Set(blockIds);
  for (const base of basesOf(planDoc).values()) {
    const undated = undatedOf(base);
    const ids = undated.toArray();
    for (let index = ids.length - 1; index >= 0; index--) {
      const id = ids[index];
      if (id !== undefined && removing.has(id)) undated.delete(index, 1);
    }
  }
}

function insertIntoUndated(base: YMap, blockId: string, beforeId: string | undefined): void {
  const undated = undatedOf(base);
  const index = beforeId === undefined ? -1 : undated.toArray().indexOf(beforeId);
  if (index === -1) {
    undated.push([blockId]);
  } else {
    undated.insert(index, [blockId]);
  }
}

function undatedOf(base: YMap): Y.Array<string> {
  return base.get("undated") as Y.Array<string>;
}

function basesOf(planDoc: Y.Doc): Y.Map<YMap> {
  return planDoc.getMap<YMap>("bases");
}

function blocksOf(planDoc: Y.Doc): Y.Map<YMap> {
  return planDoc.getMap<YMap>("blocks");
}
