/**
 * 拖拽那一族：挪块、复制块、叠放或拿出来、从这里往后整体推迟。
 * 跟着走的块在操作开始时只算一次；时间、层、跟着走的块在同一个事务里处理完，是一步撤销。
 *
 * 位置按「一行一天、每行 1440 分钟」换算：排好序的底座编号 0、1、2……，位置 = 行号 × 1440 + 分钟。
 * 往前出界夹在第一行 0 分钟，往后出界夹在最后一行 1439 分钟，不自动新建底座。
 */
import * as Y from "yjs";
import { newId } from "../ids";
import { effectiveLayer, followersOf, kindLayer, layerWhenOnto } from "../nesting";
import { readLibrary, readPlan, type BlockView, type LibraryView, type PlanView } from "../read";
import { blockInterval, type Interval } from "../time";
import type { Placement } from "./blocks";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, ok, type OpResult } from "./result";
import { setOrDelete } from "./write";

type YMap = Y.Map<unknown>;

const MINUTES_PER_DAY = 1440;

/** 放到哪天第几分钟（可以超出 0–1439，由这里换算），以及怎么放。 */
export interface DropTarget {
  baseId: string;
  minute: number;
  placement?: Placement;
  ontoBlockId?: string;
}

interface Position {
  baseId: string;
  minute: number;
}

export function moveBlock(planDoc: Y.Doc, library: Y.Doc, blockId: string, target: DropTarget): OpResult {
  const prepared = prepareDrop(planDoc, library, blockId, target);
  if (!prepared.ok) return prepared;
  const { plan, libraryView, rows, destination, delta, followerIds, newLayer, layerDelta } = prepared.value;

  planDoc.transact(() => {
    const block = rawBlock(planDoc, blockId);
    place(block, destination);
    setOrDelete(block, "layer", newLayer);
    for (const id of followerIds) {
      const follower = plan.blocks.get(id) as BlockView;
      const moved = rawBlock(planDoc, id);
      place(moved, shifted(rows, follower, delta));
      if (layerDelta !== 0) moved.set("layer", effectiveLayer(follower, libraryView) + layerDelta);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 连同会被带走的块一起复制（新 id），挂的块全在这组里的钱复制成独立的新一笔。 */
export function duplicateBlock(
  planDoc: Y.Doc,
  library: Y.Doc,
  blockId: string,
  target: DropTarget,
): OpResult<{ blockId: string }> {
  const prepared = prepareDrop(planDoc, library, blockId, target);
  if (!prepared.ok) return prepared;
  const { plan, libraryView, rows, destination, delta, followerIds, newLayer, layerDelta } = prepared.value;

  const copies = new Map<string, string>([[blockId, newId()]]);
  for (const id of followerIds) copies.set(id, newId());

  planDoc.transact(() => {
    const blocks = planDoc.getMap<YMap>("blocks");
    for (const [sourceId, copyId] of copies) {
      const copy = cloneMap(rawBlock(planDoc, sourceId));
      blocks.set(copyId, copy);
      copy.set("created_by", "me");
      if (sourceId === blockId) {
        place(copy, destination);
        setOrDelete(copy, "layer", newLayer);
      } else {
        const follower = plan.blocks.get(sourceId) as BlockView;
        place(copy, shifted(rows, follower, delta));
        if (layerDelta !== 0) copy.set("layer", effectiveLayer(follower, libraryView) + layerDelta);
      }
    }

    const expenses = planDoc.getMap<YMap>("expenses");
    for (const expense of [...expenses.values()]) {
      const linked = (expense.get("block_ids") as Y.Array<string>).toArray().filter((id) => blocks.has(id));
      if (linked.length === 0 || !linked.every((id) => copies.has(id))) continue;
      const copy = cloneMap(expense);
      copy.set("block_ids", Y.Array.from(linked.map((id) => copies.get(id) as string)));
      copy.set("created_by", "me");
      expenses.set(newId(), copy);
    }
  }, LOCAL_ORIGIN);
  return ok({ blockId: copies.get(blockId) as string });
}

/** 不改时间：给了目标块就按「叠上去时的层」算，给 null 就拿出来并排；会被带走的块跟着平移层差。 */
export function setBlockLayer(planDoc: Y.Doc, library: Y.Doc, blockId: string, ontoBlockId: string | null): OpResult {
  const libraryView = readLibrary(library);
  const plan = readPlan(planDoc, libraryView);
  const block = plan.blocks.get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  if (block.start_minute === null) return fail({ code: "NOT_TIMED" });

  const followerIds = followersOf(plan, libraryView, blockId);
  const newLayer =
    ontoBlockId === null || ontoBlockId === blockId || followerIds.includes(ontoBlockId)
      ? null
      : layerWhenOnto(plan, libraryView, block, ontoBlockId);
  const layerDelta = (newLayer ?? kindLayer(block, libraryView)) - effectiveLayer(block, libraryView);

  planDoc.transact(() => {
    setOrDelete(rawBlock(planDoc, blockId), "layer", newLayer);
    if (layerDelta === 0) return;
    for (const id of followerIds) {
      rawBlock(planDoc, id).set("layer", effectiveLayer(plan.blocks.get(id) as BlockView, libraryView) + layerDelta);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 这天、从这个分钟起开始的定时块（连同它们会带走的块）整体平移；已经开始的块不动，层不变。 */
export function shiftDayFrom(
  planDoc: Y.Doc,
  library: Y.Doc,
  baseId: string,
  minute: number,
  deltaMin: number,
): OpResult {
  const libraryView = readLibrary(library);
  const plan = readPlan(planDoc, libraryView);
  const rows = rowsOf(plan);
  if (!rows.index.has(baseId)) return fail({ code: "NOT_FOUND", id: baseId });

  const moving = new Set<string>();
  for (const block of plan.blocks.values()) {
    if (block.start_base_id === baseId && block.start_minute !== null && block.start_minute >= minute) {
      moving.add(block.id);
    }
  }
  for (const id of [...moving]) {
    for (const follower of followersOf(plan, libraryView, id)) moving.add(follower);
  }

  planDoc.transact(() => {
    for (const id of moving) {
      place(rawBlock(planDoc, id), shifted(rows, plan.blocks.get(id) as BlockView, deltaMin));
    }
  }, LOCAL_ORIGIN);
  return done();
}

interface PreparedDrop {
  plan: PlanView;
  libraryView: LibraryView;
  rows: Rows;
  destination: Position;
  delta: number;
  followerIds: string[];
  newLayer: number | null;
  layerDelta: number;
}

/** 挪块和复制共用：算落点（含出界换算）、平移量、跟着走的块、被拖块的新层和层差。 */
function prepareDrop(planDoc: Y.Doc, library: Y.Doc, blockId: string, target: DropTarget): OpResult<PreparedDrop> {
  if (!Number.isInteger(target.minute)) return fail({ code: "INVALID_FIELD", field: "start_minute" });
  const libraryView = readLibrary(library);
  const plan = readPlan(planDoc, libraryView);
  const block = plan.blocks.get(blockId);
  if (!block) return fail({ code: "NOT_FOUND", id: blockId });
  if (block.start_minute === null) return fail({ code: "NOT_TIMED" });
  const rows = rowsOf(plan);
  const targetRow = rows.index.get(target.baseId);
  if (targetRow === undefined) return fail({ code: "NOT_FOUND", id: target.baseId });

  const destination = fromLinear(rows, targetRow * MINUTES_PER_DAY + target.minute);
  const delta = toLinear(rows, destination) - toLinear(rows, { baseId: block.start_base_id, minute: block.start_minute });
  const followerIds = followersOf(plan, libraryView, blockId);
  const newLayer = layerAfterDrop(plan, libraryView, block, followerIds, target, destination);
  const layerDelta = (newLayer ?? kindLayer(block, libraryView)) - effectiveLayer(block, libraryView);
  return ok({ plan, libraryView, rows, destination, delta, followerIds, newLayer, layerDelta });
}

function layerAfterDrop(
  plan: PlanView,
  library: LibraryView,
  block: BlockView,
  followerIds: readonly string[],
  target: DropTarget,
  destination: Position,
): number | null {
  const placement = target.placement ?? "auto";
  if (placement === "beside") return null;
  if (placement === "onto") {
    const onto = target.ontoBlockId;
    if (onto === undefined || onto === block.id || followerIds.includes(onto)) return null;
    return layerWhenOnto(plan, library, block, onto);
  }

  // auto：存了层的块，挪完还和原来的外层块重叠才保留层
  if (block.layer === null) return null;
  const moved = intervalAt(plan, block, destination);
  const current = intervalAt(plan, block, { baseId: block.start_base_id, minute: block.start_minute as number });
  if (!moved || !current) return null;
  const blockKindLayer = kindLayer(block, library);
  for (const other of plan.blocks.values()) {
    if (other.id === block.id || other.start_minute === null) continue;
    if (kindLayer(other, library) !== blockKindLayer || effectiveLayer(other, library) !== block.layer - 1) continue;
    const container = intervalAt(plan, other, { baseId: other.start_base_id, minute: other.start_minute });
    if (container && overlaps(container, current) && overlaps(container, moved)) return block.layer;
  }
  return null;
}

interface Rows {
  ids: string[];
  index: ReadonlyMap<string, number>;
}

function rowsOf(plan: PlanView): Rows {
  const ids = plan.bases.map((base) => base.id);
  return { ids, index: new Map(ids.map((id, row) => [id, row])) };
}

function toLinear(rows: Rows, position: Position): number {
  return (rows.index.get(position.baseId) as number) * MINUTES_PER_DAY + position.minute;
}

function fromLinear(rows: Rows, linear: number): Position {
  const lastRow = rows.ids.length - 1;
  if (linear < 0) return { baseId: rows.ids[0] as string, minute: 0 };
  const row = Math.floor(linear / MINUTES_PER_DAY);
  if (row > lastRow) return { baseId: rows.ids[lastRow] as string, minute: MINUTES_PER_DAY - 1 };
  return { baseId: rows.ids[row] as string, minute: linear - row * MINUTES_PER_DAY };
}

function shifted(rows: Rows, block: BlockView, delta: number): Position {
  const current = toLinear(rows, { baseId: block.start_base_id, minute: block.start_minute as number });
  return fromLinear(rows, current + delta);
}

function intervalAt(plan: PlanView, block: BlockView, position: Position): Interval | null {
  const base = plan.bases.find((item) => item.id === position.baseId);
  return base ? blockInterval({ ...block, start_minute: position.minute }, base) : null;
}

function overlaps(a: Interval, b: Interval): boolean {
  return a.start < b.end && b.start < a.end;
}

function place(block: YMap, position: Position): void {
  block.set("start_base_id", position.baseId);
  block.set("start_minute", position.minute);
}

function rawBlock(planDoc: Y.Doc, id: string): YMap {
  return planDoc.getMap<YMap>("blocks").get(id) as YMap;
}

/** 复制一个块或一笔钱的 Y.Map：Y.Text、Y.Array 复制成新的，普通值原样复制。 */
function cloneMap(source: YMap): YMap {
  const copy = new Y.Map<unknown>();
  for (const [key, value] of source.entries()) {
    if (value instanceof Y.Text) {
      const text = new Y.Text();
      text.insert(0, value.toString());
      copy.set(key, text);
    } else if (value instanceof Y.Array) {
      copy.set(key, Y.Array.from(value.toArray()));
    } else {
      copy.set(key, value);
    }
  }
  return copy;
}
