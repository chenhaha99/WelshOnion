import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary } from "../read";
import { initLibraryDoc } from "../schema";
import { addKind, addPlace, addTag, deleteKind, deleteTag, updateKind, updatePlace, updateTag } from "./library";
import type { OpResult } from "./result";

let library: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
});

const kinds = () => library.getMap<Y.Map<unknown>>("kinds");
const places = () => library.getMap<Y.Map<unknown>>("places");
const tags = () => library.getMap<Y.Map<unknown>>("tags");

function unwrap<T>(result: OpResult<T>): T {
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

const AMAP = { poi_id: "B023B0FFH5", location: "120.4331,30.8649", citycode: "0572" };

describe("新建自定义类型", () => {
  test("默认放最上层", () => {
    const { kindId } = unwrap(addKind(library, { name: "工作", color: "#5b7fa6" }));

    expect(kinds().get(kindId)?.toJSON()).toEqual({
      name: "工作",
      color: "#5b7fa6",
      layer: 2,
      builtin: false,
      order: 8,
    });
  });

  test("指定层", () => {
    const { kindId } = unwrap(addKind(library, { name: "背景", color: "#cccccc", layer: 0 }));

    expect(kinds().get(kindId)?.get("layer")).toBe(0);
  });

  test("颜色不合法", () => {
    expect(addKind(library, { name: "工作", color: "blue" })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "color" },
    });
    expect(kinds().size).toBe(7);
  });
});

describe("修改类型", () => {
  test("改预设类型的名字和颜色", () => {
    expect(updateKind(library, "sight", { name: "景点", color: "#123456" }).ok).toBe(true);

    expect(kinds().get("sight")?.get("name")).toBe("景点");
    expect(kinds().get("sight")?.get("color")).toBe("#123456");
    expect(kinds().get("sight")?.get("builtin")).toBe(true);
  });
});

describe("删除类型", () => {
  test("删掉自定义类型", () => {
    const { kindId } = unwrap(addKind(library, { name: "工作", color: "#5b7fa6" }));

    expect(deleteKind(library, kindId).ok).toBe(true);

    expect(kinds().has(kindId)).toBe(false);
  });

  test("预设类型不能删", () => {
    expect(deleteKind(library, "stay")).toEqual({ ok: false, error: { code: "BUILTIN" } });
    expect(kinds().has("stay")).toBe(true);
  });
});

describe("新建、修改、删除标签", () => {
  test("新建的排在最后", () => {
    const { tagId: first } = unwrap(addTag(library, { name: "必去", color: "#c08d68" }));
    const { tagId: second } = unwrap(addTag(library, { name: "下雨也能去", color: "#6b8fb0" }));

    expect(tags().get(first)?.toJSON()).toEqual({ name: "必去", color: "#c08d68", order: 1 });
    expect(tags().get(second)?.get("order")).toBe(2);
  });

  test("颜色不合法", () => {
    expect(addTag(library, { name: "必去", color: "red" })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "color" },
    });
    expect(tags().size).toBe(0);
  });

  test("改名、改颜色", () => {
    const { tagId } = unwrap(addTag(library, { name: "必去", color: "#c08d68" }));

    expect(updateTag(library, tagId, { name: "一定要去", color: "#6b8fb0" }).ok).toBe(true);

    expect(tags().get(tagId)?.toJSON()).toEqual({ name: "一定要去", color: "#6b8fb0", order: 1 });
  });

  test("改不存在的", () => {
    expect(updateTag(library, "nope", { name: "x" })).toEqual({ ok: false, error: { code: "NOT_FOUND", id: "nope" } });
  });

  test("删掉：没有预设，都能删", () => {
    const { tagId } = unwrap(addTag(library, { name: "必去", color: "#c08d68" }));

    expect(deleteTag(library, tagId).ok).toBe(true);

    expect(tags().has(tagId)).toBe(false);
    expect(deleteTag(library, tagId)).toEqual({ ok: false, error: { code: "NOT_FOUND", id: tagId } });
  });
});

describe("存一个地点", () => {
  test("从高德搜来的地点", () => {
    const { placeId } = unwrap(
      addPlace(library, {
        name: "南浔古镇",
        address: "浙江省湖州市南浔区南东街",
        lat: 30.8677,
        lng: 120.4269,
        providers: { amap: AMAP },
      }),
    );

    expect(readLibrary(library).places.get(placeId)).toEqual({
      id: placeId,
      name: "南浔古镇",
      address: "浙江省湖州市南浔区南东街",
      lat: 30.8677,
      lng: 120.4269,
      providers: { amap: AMAP },
    });
  });

  test("手填的地点", () => {
    const { placeId } = unwrap(addPlace(library, { name: "老王家民宿", lat: 30.8721, lng: 120.4338 }));

    expect(places().get(placeId)?.has("address")).toBe(false);
    expect((places().get(placeId)?.get("providers") as Y.Map<unknown>).size).toBe(0);
  });

  test("坐标超出范围", () => {
    expect(addPlace(library, { name: "x", lat: 91, lng: 120 })).toEqual({
      ok: false,
      error: { code: "INVALID_FIELD", field: "lat" },
    });
  });
});

describe("修改地点", () => {
  test("起个好记的名字", () => {
    const { placeId } = unwrap(addPlace(library, { name: "蟹馆", lat: 31.4, lng: 120.8 }));

    expect(updatePlace(library, placeId, { name: "阳澄湖那家蟹馆" }).ok).toBe(true);

    expect(places().get(placeId)?.get("name")).toBe("阳澄湖那家蟹馆");
    expect(places().get(placeId)?.get("lat")).toBe(31.4);
  });

  test("各家服务商的数据互不影响", () => {
    const { placeId } = unwrap(addPlace(library, { name: "南浔古镇", lat: 30.8677, lng: 120.4269, providers: { amap: AMAP } }));
    const providerKeys = () => Object.keys(readLibrary(library).places.get(placeId)?.providers ?? {}).sort();

    updatePlace(library, placeId, { providers: { google: { place_id: "g1" } } });
    expect(providerKeys()).toEqual(["amap", "google"]);

    updatePlace(library, placeId, { providers: { amap: null } });
    expect(providerKeys()).toEqual(["google"]);
  });
});
