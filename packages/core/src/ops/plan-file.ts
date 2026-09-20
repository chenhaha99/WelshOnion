/**
 * 计划文件：一个计划导出成一段 JSON 文本，读回来，再导进一份新的计划文档。
 * 计划整份编码进去（一个字段都不漏）；它用到的类型、标签、地点写成普通对象，导入时按 id、名字、高德 poi_id 合并进本机资料库。
 */
import * as Y from "yjs";
import { readLibrary, type LibraryView } from "../read";
import { SCHEMA_VERSION, upgradePlanDoc } from "../schema";
import { validateField } from "../validate";
import { LOCAL_ORIGIN } from "./origin";
import { writeIndexEntry } from "./plan";
import { done, fail, ok, type OpResult } from "./result";

const FORMAT = "welshonion-plan";
/**
 * 文件这一层的版本，和计划文档里的 meta.schema 分开管。
 * 第 2 版（2026-09-17）去掉了状态；第 1 版的文件照样能读，里面的状态不要。
 */
const FILE_VERSION = 3;

type YMap = Y.Map<unknown>;

export interface FileKind {
  id: string;
  name: string;
  color: string;
  layer: number;
  order: number;
}

export interface FileTag {
  id: string;
  name: string;
  color: string;
  order: number;
}

export interface FilePlace {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  providers: Readonly<Record<string, unknown>>;
}

/** 读好的计划文件。 */
export interface PlanFile {
  planId: string;
  name: string;
  /** 整个计划文档编码后的样子 */
  plan: Uint8Array;
  library: { kinds: FileKind[]; tags: FileTag[]; places: FilePlace[] };
}

export interface ImportPlanOptions {
  planId: string;
  /** 给了就换名字（本机已经有同一个计划、另存一份时用） */
  name?: string;
  now: string;
}

/** 导出：整个计划编码成 base64，加上它的块、钱用到、本机资料库里还在的类型、标签、地点。计划索引不放。 */
export function exportPlan(library: Y.Doc, planDoc: Y.Doc, now: string): string {
  const used = usedLibraryIds(planDoc);
  const view = readLibrary(library);
  const kinds = [...view.kinds.values()]
    .filter((kind) => used.kinds.has(kind.id))
    .sort(byOrder)
    .map(({ id, name, color, layer, order }) => ({ id, name, color, layer, order }));
  const tags = [...view.tags.values()]
    .filter((tag) => used.tags.has(tag.id))
    .sort(byOrder)
    .map(({ id, name, color, order }) => ({ id, name, color, order }));
  const places = [...view.places.values()]
    .filter((place) => used.places.has(place.id))
    .sort((a, b) => compareIds(a.id, b.id))
    .map(({ id, name, address, lat, lng, providers }) => ({ id, name, address, lat, lng, providers }));

  return JSON.stringify({
    format: FORMAT,
    version: FILE_VERSION,
    exported_at: now,
    plan: encodeBase64(Y.encodeStateAsUpdate(planDoc)),
    library: { kinds, tags, places },
  });
}

/**
 * 读文件，第一条不过就返回错误，什么都不写：不是 JSON 或 format 不对、计划解码不出带 id 的文档、条目不合法是 FILE_NOT_PLAN；
 * 文件版本或计划文档的 schema 比代码支持的新是 FILE_TOO_NEW。
 */
export function parsePlanFile(text: string): OpResult<PlanFile> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail({ code: "FILE_NOT_PLAN" });
  }
  if (!isObject(data) || data.format !== FORMAT || !isPositiveInteger(data.version)) return fail({ code: "FILE_NOT_PLAN" });
  if (data.version > FILE_VERSION) return fail({ code: "FILE_TOO_NEW" });

  const plan = typeof data.plan === "string" ? decodeBase64(data.plan) : null;
  if (plan === null) return fail({ code: "FILE_NOT_PLAN" });
  const probe = new Y.Doc();
  try {
    Y.applyUpdate(probe, plan);
  } catch {
    return fail({ code: "FILE_NOT_PLAN" });
  }
  const planId = probe.getMap("meta").get("plan_id");
  const schema = probe.getMap("meta").get("schema");
  if (typeof planId !== "string" || typeof schema !== "number") return fail({ code: "FILE_NOT_PLAN" });
  if (schema > SCHEMA_VERSION) return fail({ code: "FILE_TOO_NEW" });
  const name = probe.getMap("plan").get("name");
  if (typeof name !== "string") return fail({ code: "FILE_NOT_PLAN" });

  const library = parseLibrary(data.library);
  if (library === null) return fail({ code: "FILE_NOT_PLAN" });
  return ok({ planId, name, plan, library });
}

/**
 * 导进一份空的计划文档：计划原样解进去（结构版本旧的顺手迁移），换计划 id（给了名字就换名字）；
 * 类型、标签、地点合并进本机资料库，计划里 id 变了的引用改成本机的；最后写计划索引。不进撤销。
 */
export function importPlan(library: Y.Doc, target: Y.Doc, file: PlanFile, options: ImportPlanOptions): OpResult {
  const merge = planMerge(readLibrary(library), file.library);

  Y.applyUpdate(target, file.plan);
  target.transact(() => {
    if (target.getMap("meta").get("schema") !== SCHEMA_VERSION) upgradePlanDoc(target);
    target.getMap("meta").set("plan_id", options.planId);
    if (options.name !== undefined) target.getMap("plan").set("name", options.name);
    for (const block of target.getMap<YMap>("blocks").values()) {
      remapField(block, "kind_id", merge.kindIds);
      remapList(block, "place_ids", merge.placeIds);
      remapList(block, "tag_ids", merge.tagIds);
    }
    for (const expense of target.getMap<YMap>("expenses").values()) remapField(expense, "kind_id", merge.kindIds);
  });

  library.transact(() => {
    const kinds = library.getMap<YMap>("kinds");
    let kindOrder = merge.maxKindOrder;
    for (const kind of merge.newKinds) {
      kinds.set(
        kind.id,
        new Y.Map<unknown>([
          ["name", kind.name],
          ["color", kind.color],
          ["layer", kind.layer],
          ["builtin", false],
          ["order", ++kindOrder],
        ]),
      );
    }
    const tags = library.getMap<YMap>("tags");
    let tagOrder = merge.maxTagOrder;
    for (const tag of merge.newTags) {
      tags.set(
        tag.id,
        new Y.Map<unknown>([
          ["name", tag.name],
          ["color", tag.color],
          ["order", ++tagOrder],
        ]),
      );
    }
    const places = library.getMap<YMap>("places");
    for (const place of merge.newPlaces) {
      const entry = new Y.Map<unknown>();
      places.set(place.id, entry);
      entry.set("name", place.name);
      if (place.address !== null) entry.set("address", place.address);
      entry.set("lat", place.lat);
      entry.set("lng", place.lng);
      entry.set("providers", new Y.Map<unknown>(Object.entries(place.providers)));
    }
  }, LOCAL_ORIGIN);

  writeIndexEntry(library, target, options.now);
  return done();
}

interface Merge {
  /** 文件里的 id → 本机的 id，只记变了的 */
  kindIds: Map<string, string>;
  tagIds: Map<string, string>;
  placeIds: Map<string, string>;
  newKinds: FileKind[];
  newTags: FileTag[];
  newPlaces: FilePlace[];
  maxKindOrder: number;
  maxTagOrder: number;
}

/**
 * 按导入前的本机资料库算怎么合并，不写文档。类型、标签：先比 id，再比名字（同名几条取排序最靠前的）；
 * 地点：先比 id，再比高德 poi_id，从不按名字。都对不上就新建，沿用文件里的 id。
 */
function planMerge(local: LibraryView, file: PlanFile["library"]): Merge {
  const merge: Merge = {
    kindIds: new Map(),
    tagIds: new Map(),
    placeIds: new Map(),
    newKinds: [],
    newTags: [],
    newPlaces: [],
    maxKindOrder: maxOrder(local.kinds.values()),
    maxTagOrder: maxOrder(local.tags.values()),
  };

  for (const kind of file.kinds) {
    const match = local.kinds.has(kind.id) ? kind.id : firstByName(local.kinds.values(), kind.name);
    if (match === null) merge.newKinds.push(kind);
    else if (match !== kind.id) merge.kindIds.set(kind.id, match);
  }
  for (const tag of file.tags) {
    const match = local.tags.has(tag.id) ? tag.id : firstByName(local.tags.values(), tag.name);
    if (match === null) merge.newTags.push(tag);
    else if (match !== tag.id) merge.tagIds.set(tag.id, match);
  }
  for (const place of file.places) {
    const poiId = amapPoiId(place.providers);
    const match = local.places.has(place.id)
      ? place.id
      : poiId === null
        ? null
        : ([...local.places.values()].find((candidate) => amapPoiId(candidate.providers) === poiId)?.id ?? null);
    if (match === null) merge.newPlaces.push(place);
    else if (match !== place.id) merge.placeIds.set(place.id, match);
  }
  return merge;
}

function usedLibraryIds(planDoc: Y.Doc) {
  const used = { kinds: new Set<string>(), tags: new Set<string>(), places: new Set<string>() };
  for (const block of planDoc.getMap<YMap>("blocks").values()) {
    const kindId = block.get("kind_id");
    if (typeof kindId === "string") used.kinds.add(kindId);
    for (const [field, ids] of [
      ["tag_ids", used.tags],
      ["place_ids", used.places],
    ] as const) {
      const list = block.get(field);
      if (list instanceof Y.Array) {
        for (const id of list.toArray()) if (typeof id === "string") ids.add(id);
      }
    }
  }
  for (const expense of planDoc.getMap<YMap>("expenses").values()) {
    const kindId = expense.get("kind_id");
    if (typeof kindId === "string") used.kinds.add(kindId);
  }
  return used;
}

/** 第 1 版文件里还有 statuses，不读；还没有 tags，当成空的。 */
function parseLibrary(value: unknown): PlanFile["library"] | null {
  if (!isObject(value) || !Array.isArray(value.kinds) || !Array.isArray(value.places)) return null;
  const rawTags = value.tags ?? [];
  if (!Array.isArray(rawTags)) return null;
  const kinds: FileKind[] = [];
  for (const item of value.kinds) {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string" || !isFiniteNumber(item.order)) return null;
    if (!validateField("color", item.color).ok || typeof item.layer !== "number" || !validateField("layer", item.layer).ok) return null;
    kinds.push({ id: item.id, name: item.name, color: item.color as string, layer: item.layer, order: item.order });
  }
  const tags: FileTag[] = [];
  for (const item of rawTags) {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string" || !isFiniteNumber(item.order)) return null;
    if (!validateField("color", item.color).ok) return null;
    tags.push({ id: item.id, name: item.name, color: item.color as string, order: item.order });
  }
  const places: FilePlace[] = [];
  for (const item of value.places) {
    if (!isObject(item) || typeof item.id !== "string" || typeof item.name !== "string") return null;
    if (item.address !== null && typeof item.address !== "string") return null;
    if (!validateField("lat", item.lat).ok || !validateField("lng", item.lng).ok || !isObject(item.providers)) return null;
    places.push({
      id: item.id,
      name: item.name,
      address: item.address,
      lat: item.lat as number,
      lng: item.lng as number,
      providers: item.providers,
    });
  }
  return { kinds, tags, places };
}

function remapField(entry: YMap, field: string, ids: ReadonlyMap<string, string>): void {
  const id = entry.get(field);
  if (typeof id !== "string") return;
  const next = ids.get(id);
  if (next !== undefined) entry.set(field, next);
}

/** 数组里 id 变了的换成本机的；一个都没变就不写。 */
function remapList(entry: YMap, field: string, ids: ReadonlyMap<string, string>): void {
  const list = entry.get(field);
  if (!(list instanceof Y.Array)) return;
  const current = list.toArray() as string[];
  const next = current.map((id) => ids.get(id) ?? id);
  if (next.every((id, index) => id === current[index])) return;
  list.delete(0, list.length);
  list.insert(0, next);
}

function firstByName(entries: Iterable<{ id: string; name: string; order: number }>, name: string): string | null {
  return [...entries].filter((entry) => entry.name === name).sort(byOrder)[0]?.id ?? null;
}

function amapPoiId(providers: Readonly<Record<string, unknown>>): string | null {
  const amap = providers.amap;
  return isObject(amap) && typeof amap.poi_id === "string" ? amap.poi_id : null;
}

function maxOrder(entries: Iterable<{ order: number }>): number {
  let max = 0;
  for (const entry of entries) max = Math.max(max, entry.order);
  return max;
}

function byOrder(a: { id: string; order: number }, b: { id: string; order: number }): number {
  return a.order - b.order || compareIds(a.id, b.id);
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** 自己写 base64：core 在浏览器和 Node 里都要跑，不依赖哪一边才有的 btoa、Buffer。 */
function encodeBase64(bytes: Uint8Array): string {
  let text = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const second = bytes[i + 1];
    const third = bytes[i + 2];
    const triple = (bytes[i]! << 16) | ((second ?? 0) << 8) | (third ?? 0);
    text += BASE64[(triple >> 18) & 63]! + BASE64[(triple >> 12) & 63]!;
    text += second === undefined ? "=" : BASE64[(triple >> 6) & 63]!;
    text += third === undefined ? "=" : BASE64[triple & 63]!;
  }
  return text;
}

/** 不是合法的 base64 返回 null。 */
function decodeBase64(text: string): Uint8Array | null {
  if (text.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text)) return null;
  const padding = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    let triple = 0;
    for (let k = 0; k < 4; k++) {
      const char = text[i + k]!;
      triple = (triple << 6) | (char === "=" ? 0 : BASE64.indexOf(char));
    }
    for (const byte of [(triple >> 16) & 255, (triple >> 8) & 255, triple & 255]) {
      if (at < bytes.length) bytes[at++] = byte;
    }
  }
  return bytes;
}
