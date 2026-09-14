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
    expect(readLibrary(first.doc).statuses.size).toBe(2);
    expect(first.doc.getMap("meta").get("schema")).toBe(1);
    await first.close();

    const second = track(await openLibrary());
    expect(readLibrary(second.doc).kinds.size).toBe(7);
    expect(readLibrary(second.doc).statuses.size).toBe(2);
    expect(second.doc.getMap("meta").get("schema")).toBe(1);
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

  it("版本比代码新：拒绝打开", async () => {
    await storeDoc(LIBRARY_DB, (doc) => {
      initLibraryDoc(doc);
      doc.getMap("meta").set("schema", 2);
    });

    await expect(openLibrary()).rejects.toMatchObject({ code: "SCHEMA_TOO_NEW" });
  });
});
