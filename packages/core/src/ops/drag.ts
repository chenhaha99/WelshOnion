/**
 * 拖拽那一族：挪块、复制块、拖左端改开始、叠放或拿出来、从这里往后整体推迟。
 * 跟着走的块在操作开始时只算一次；时间、层、跟着走的块在同一个事务里处理完，是一步撤销。
 *
 * 位置按「一行一天、每行 1440 分钟」换算：排好序的底座编号 0、1、2……，位置 = 行号 × 1440 + 分钟。
 * 往前出界夹在第一行 0 分钟，往后出界夹在最后一行 1439 分钟，不自动新建底座。
 */
import * as Y from "yjs";
import { newId } from "../ids";
import { effectiveLayer, followersOf, kindLayer, layerWhenOnto } from "../nesting";
import { compareBases } from "../order";
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

/**
 * 拖左端：开始挪到给定底座的给定分钟（可以超出 0–1439，由这里换算），结束不动，时长跟着变。
 * 里面的块和层都不动，所以不能拿挪块加改时长拼。开始晚于结束就失败，什么都不改。
 */
export function resizeBlockStart(planDoc: Y.Doc, blockId: string, target: Position): OpResult {
  if (!Number.isInteger(target.minute)) return fail({ code: "INVALID_FIELD", field: "start_minute" });
  const rows = rawRows(planDoc);
  const block = planDoc.getMap<YMap>("blocks").get(blockId);
  const baseId = block?.get("start_base_id") as string | undefined;
  // 底座已经被删的块当成已删除，和读取入口一致
  if (!block || baseId === undefined || !rows.index.has(baseId)) return fail({ code: "NOT_FOUND", id: blockId });
  const startMinute = block.get("start_minute") as number | undefined;
  if (startMinute === undefined) return fail({ code: "NOT_TIMED" });
  const targetRow = rows.index.get(target.baseId);
  if (targetRow === undefined) return fail({ code: "NOT_FOUND", id: target.baseId });

  const end = toLinear(rows, { baseId, minute: startMinute }) + ((block.get("duration_min") as number | undefined) ?? 0);
  const destination = fromLinear(rows, targetRow * MINUTES_PER_DAY + target.minute);
  const duration = end - toLinear(rows, destination);
  if (duration < 0) return fail({ code: "INVALID_FIELD", field: "duration_min" });

  planDoc.transact(() => {
    place(block, destination);
    block.set("duration_min", duration);
  }, LOCAL_ORIGIN);
  return done();
}

/** 直接从文档里排好底座，不经过读取入口（这里用不到资料库）。 */
function rawRows(planDoc: Y.Doc): Rows {
  const ids = [...planDoc.getMap<YMap>("bases").entries()]
    .map(([id, map]) => ({ id, date: map.get("date") as string }))
    .sort(compareBases)
    .map((base) => base.id);
  return { ids, index: new Map(ids.map((id, row) => [id, row])) };
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

/** 松手前算出来的复制块的 id：原 id 后面加这个（只在内存里，不会和 UUIDv7 撞） */
const COPY_SUFFIX = ":copy";

/** previewDrop 复制时，复制出来的块在算出来的计划里的 id。 */
export function previewCopyId(blockId: string): string {
  return blockId + COPY_SUFFIX;
}

/**
 * 松手前算出挪块（copy 为真时是复制块）以后计划里的块是什么样，不改文档：
 * 每个块的底座、分钟、存的层，和 moveBlock / duplicateBlock 写进去再读出来的一样；复制出来的块 id 是原 id 加「:copy」。
 * 只算块，不算钱：给时间线拖动中画松手后的样子用。
 */
export function previewDrop(
  plan: PlanView,
  library: LibraryView,
  blockId: string,
  target: DropTarget,
  options: { copy: boolean },
): OpResult<PlanView> {
  const prepared = dropOn(plan, library, blockId, target);
  if (!prepared.ok) return prepared;
  const { rows, destination, delta, followerIds, newLayer, layerDelta } = prepared.value;
  const idOf = (id: string) => (options.copy ? previewCopyId(id) : id);

  const blocks = new Map(plan.blocks);
  const block = plan.blocks.get(blockId) as BlockView;
  blocks.set(idOf(blockId), {
    ...block,
    id: idOf(blockId),
    start_base_id: destination.baseId,
    start_minute: destination.minute,
    layer: newLayer,
  });
  for (const id of followerIds) {
    const follower = plan.blocks.get(id) as BlockView;
    const position = shifted(rows, follower, delta);
    blocks.set(idOf(id), {
      ...follower,
      id: idOf(id),
      start_base_id: position.baseId,
      start_minute: position.minute,
      layer: layerDelta === 0 ? follower.layer : effectiveLayer(follower, library) + layerDelta,
    });
  }
  return ok({ ...plan, blocks });
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

/** 挪块和复制共用：读出计划，算落点、平移量、跟着走的块、被拖块的新层和层差。 */
function prepareDrop(planDoc: Y.Doc, library: Y.Doc, blockId: string, target: DropTarget): OpResult<PreparedDrop> {
  const libraryView = readLibrary(library);
  return dropOn(readPlan(planDoc, libraryView), libraryView, blockId, target);
}

/** 不读文档，在给定的计划视图上算：落点（含出界换算）、平移量、跟着走的块、被拖块的新层和层差。previewDrop 也用它。 */
function dropOn(plan: PlanView, libraryView: LibraryView, blockId: string, target: DropTarget): OpResult<PreparedDrop> {
  if (!Number.isInteger(target.minute)) return fail({ code: "INVALID_FIELD", field: "start_minute" });
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
