import { initLibraryDoc, readLibrary } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import * as Y from "yjs";
import { openLibrary } from "./library";
import { LIBRARY_DB } from "./names";
import { releaseAll, storeDoc, track } from "./test-helpers";

afterEach(releaseAll);

describe("打开资料库", () => {
  it("第一次打开：初始化，关掉再开还在", async () => {
    const first = await openLibrary();
    expect(readLibrary(first.doc).kinds.size).toBe(7);
    expect(first.doc.getMap("meta").get("schema")).toBe(3);
    await first.close();

    const second = track(await openLibrary());
    expect(readLibrary(second.doc).kinds.size).toBe(7);
    expect(second.doc.getMap("meta").get("schema")).toBe(3);
  });

  it("老资料库补上缺的预设，已有的不改", async () => {
    await storeDoc(LIBRARY_DB, (doc) => {
      initLibraryDoc(doc);
      doc.getMap<Y.Map<unknown>>("kinds").get("sight")!.set("name", "景点");
      doc.getMap("kinds").delete("shopping");
    });

    const library = track(await openLibrary());
    const kinds = readLibrary(library.doc).kinds;
    expect(kinds.has("shopping")).toBe(true);
    expect(kinds.get("sight")?.name).toBe("景点");
  });

  it("版本 1 的资料库：打开时清空状态、版本写成 3，类型不动", async () => {
    await storeDoc(LIBRARY_DB, (doc) => {
      initLibraryDoc(doc);
      doc.getMap("meta").set("schema", 1);
      const statuses = doc.getMap<Y.Map<unknown>>("statuses");
      statuses.set("pending", new Y.Map<unknown>([["name", "待定"]]));
      statuses.set("confirmed", new Y.Map<unknown>([["name", "已确认"]]));
    });

    const first = await openLibrary();
    expect(first.doc.getMap("statuses").size).toBe(0);
    expect(first.doc.getMap("meta").get("schema")).toBe(3);
    expect(readLibrary(first.doc).kinds.size).toBe(7);
    await first.close();

    const second = track(await openLibrary());
    expect(second.doc.getMap("statuses").size).toBe(0);
    expect(second.doc.getMap("meta").get("schema")).toBe(3);
  });

  it("版本比代码新：拒绝打开", async () => {
    await storeDoc(LIBRARY_DB, (doc) => {
      initLibraryDoc(doc);
      doc.getMap("meta").set("schema", 4);
    });

    await expect(openLibrary()).rejects.toMatchObject({ code: "SCHEMA_TOO_NEW" });
  });
});
