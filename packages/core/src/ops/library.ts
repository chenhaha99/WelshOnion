/**
 * 资料库操作：类型、标签、地点（跨计划共用）。
 * 资料库文档没有撤销管理器，所以这些写入不进撤销。
 */
import * as Y from "yjs";
import { newId } from "../ids";
import type { ValidatedField } from "../validate";
import { LOCAL_ORIGIN } from "./origin";
import { done, fail, firstInvalidField, ok, type OpResult } from "./result";
import { setOrDelete } from "./write";

type YMap = Y.Map<unknown>;
type Checks = Array<readonly [ValidatedField, unknown]>;

/** 一家地图服务商的原始数据，比如高德的 poi_id、GCJ-02 坐标、citycode。 */
export type ProviderData = Readonly<Record<string, unknown>>;

export interface KindPatch {
  name?: string;
  color?: string;
  layer?: number;
}

export interface TagPatch {
  name?: string;
  color?: string;
}

export interface AddPlaceInput {
  name: string;
  address?: string;
  /** WGS-84 */
  lat: number;
  lng: number;
  providers?: Readonly<Record<string, ProviderData>>;
}

export interface PlacePatch {
  name?: string;
  address?: string | null;
  lat?: number;
  lng?: number;
  /** 按服务商逐格合并：给哪家写哪家，null 删掉那一家 */
  providers?: Readonly<Record<string, ProviderData | null>>;
}

/** 不给层就放「最上层」（现存类型里最大的层）；顺序排在最后。 */
export function addKind(library: Y.Doc, input: { name: string; color: string; layer?: number }): OpResult<{ kindId: string }> {
  const kinds = entriesOf(library, "kinds");
  const layer = input.layer ?? maxNumber(kinds, "layer");
  const invalid = firstInvalidField([
    ["color", input.color],
    ["layer", layer],
  ]);
  if (invalid) return fail(invalid);

  const kindId = newId();
  const order = maxNumber(kinds, "order") + 1;
  library.transact(() => {
    kinds.set(
      kindId,
      new Y.Map<unknown>([
        ["name", input.name],
        ["color", input.color],
        ["layer", layer],
        ["builtin", false],
        ["order", order],
      ]),
    );
  }, LOCAL_ORIGIN);
  return ok({ kindId });
}

/** 预设类型也可以改名、改色、改层。 */
export function updateKind(library: Y.Doc, kindId: string, patch: KindPatch): OpResult {
  const checks: Checks = [];
  if (patch.color !== undefined) checks.push(["color", patch.color]);
  if (patch.layer !== undefined) checks.push(["layer", patch.layer]);
  return updateEntry(library, "kinds", kindId, patch, checks);
}

/** 不检查有没有块在用：在用的块读出来是「已删除的类型」。 */
export function deleteKind(library: Y.Doc, kindId: string): OpResult {
  return deleteEntry(library, "kinds", kindId);
}

/** 标签只有名字和颜色，顺序排在最后；没有预设。 */
export function addTag(library: Y.Doc, input: { name: string; color: string }): OpResult<{ tagId: string }> {
  const invalid = firstInvalidField([["color", input.color]]);
  if (invalid) return fail(invalid);
  const tags = entriesOf(library, "tags");

  const tagId = newId();
  const order = maxNumber(tags, "order") + 1;
  library.transact(() => {
    tags.set(
      tagId,
      new Y.Map<unknown>([
        ["name", input.name],
        ["color", input.color],
        ["order", order],
      ]),
    );
  }, LOCAL_ORIGIN);
  return ok({ tagId });
}

export function updateTag(library: Y.Doc, tagId: string, patch: TagPatch): OpResult {
  const checks: Checks = [];
  if (patch.color !== undefined) checks.push(["color", patch.color]);
  return updateEntry(library, "tags", tagId, patch, checks);
}

/** 不检查有没有事挂着：挂着的事读出来就没有这个标签了。 */
export function deleteTag(library: Y.Doc, tagId: string): OpResult {
  return deleteEntry(library, "tags", tagId);
}

export function addPlace(library: Y.Doc, input: AddPlaceInput): OpResult<{ placeId: string }> {
  const invalid = firstInvalidField([
    ["lat", input.lat],
    ["lng", input.lng],
  ]);
  if (invalid) return fail(invalid);

  const placeId = newId();
  library.transact(() => {
    const place = new Y.Map<unknown>();
    entriesOf(library, "places").set(placeId, place);
    place.set("name", input.name);
    if (input.address !== undefined) place.set("address", input.address);
    place.set("lat", input.lat);
    place.set("lng", input.lng);
    place.set("providers", new Y.Map<unknown>(Object.entries(input.providers ?? {})));
  }, LOCAL_ORIGIN);
  return ok({ placeId });
}

export function updatePlace(library: Y.Doc, placeId: string, patch: PlacePatch): OpResult {
  const checks: Checks = [];
  if (patch.lat !== undefined) checks.push(["lat", patch.lat]);
  if (patch.lng !== undefined) checks.push(["lng", patch.lng]);
  const invalid = firstInvalidField(checks);
  if (invalid) return fail(invalid);
  const place = entriesOf(library, "places").get(placeId);
  if (!place) return fail({ code: "NOT_FOUND", id: placeId });

  library.transact(() => {
    for (const key of ["name", "address", "lat", "lng"] as const) {
      const value = patch[key];
      if (value !== undefined) setOrDelete(place, key, value);
    }
    if (patch.providers !== undefined) {
      const providers = place.get("providers") as YMap;
      for (const [provider, data] of Object.entries(patch.providers)) {
        setOrDelete(providers, provider, data);
      }
    }
  }, LOCAL_ORIGIN);
  return done();
}

function updateEntry(
  library: Y.Doc,
  collection: "kinds" | "tags",
  id: string,
  patch: KindPatch | TagPatch,
  checks: Checks,
): OpResult {
  const invalid = firstInvalidField(checks);
  if (invalid) return fail(invalid);
  const entry = entriesOf(library, collection).get(id);
  if (!entry) return fail({ code: "NOT_FOUND", id });
  library.transact(() => {
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) entry.set(key, value);
    }
  }, LOCAL_ORIGIN);
  return done();
}

/** 预设的删不了（只有类型有预设）。 */
function deleteEntry(library: Y.Doc, collection: "kinds" | "tags", id: string): OpResult {
  const entries = entriesOf(library, collection);
  const entry = entries.get(id);
  if (!entry) return fail({ code: "NOT_FOUND", id });
  if (entry.get("builtin") === true) return fail({ code: "BUILTIN" });
  library.transact(() => entries.delete(id), LOCAL_ORIGIN);
  return done();
}

function maxNumber(entries: Y.Map<YMap>, field: "layer" | "order"): number {
  let max = 0;
  for (const entry of entries.values()) {
    const value = entry.get(field);
    if (typeof value === "number") max = Math.max(max, value);
  }
  return max;
}

function entriesOf(library: Y.Doc, collection: "kinds" | "tags" | "places"): Y.Map<YMap> {
  return library.getMap<YMap>(collection);
}
