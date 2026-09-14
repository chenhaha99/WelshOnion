import * as Y from "yjs";
import { beforeEach, describe, expect, test } from "vitest";
import { readLibrary } from "../read";
import { initLibraryDoc } from "../schema";
import { addKind, addPlace, addStatus, deleteKind, deleteStatus, updateKind, updatePlace, updateStatus } from "./library";
import type { OpResult } from "./result";

let library: Y.Doc;

beforeEach(() => {
  library = new Y.Doc();
  initLibraryDoc(library);
});

const kinds = () => library.getMap<Y.Map<unknown>>("kinds");
const statuses = () => library.getMap<Y.Map<unknown>>("statuses");
const places = () => library.getMap<Y.Map<unknown>>("places");

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

describe("新建、修改、删除状态", () => {
  test("新建「已预订」", () => {
    const { statusId } = unwrap(addStatus(library, { name: "已预订", color: "#c08d68" }));

    expect(statuses().get(statusId)?.toJSON()).toEqual({ name: "已预订", color: "#c08d68", builtin: false, order: 3 });
  });

  test("改状态颜色", () => {
    updateStatus(library, "confirmed", { color: "#000000" });

    expect(statuses().get("confirmed")?.get("color")).toBe("#000000");
  });

  test("预设状态不能删", () => {
    expect(deleteStatus(library, "pending")).toEqual({ ok: false, error: { code: "BUILTIN" } });
  });

  test("删掉自定义状态", () => {
    const { statusId } = unwrap(addStatus(library, { name: "已预订", color: "#c08d68" }));

    deleteStatus(library, statusId);

    expect(statuses().has(statusId)).toBe(false);
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
