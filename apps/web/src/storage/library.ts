import { initLibraryDoc, openLibraryDoc, seedLibrary } from "@welshonion/core";
import { LIBRARY_DB } from "./names";
import { isNotInitialized, loadStoredDoc, type DocHandle } from "./stored-doc";

export type LibraryHandle = DocHandle;

/**
 * 等本机内容加载完，再检查版本、补缺的预设（加载完之前补，会和本机已有的打架），最后接上标签页同步。
 * 本机还没有资料库就初始化一个。
 */
export async function openLibrary(): Promise<LibraryHandle> {
  const stored = await loadStoredDoc(LIBRARY_DB);
  try {
    openLibraryDoc(stored.doc);
  } catch (error) {
    if (!isNotInitialized(error)) {
      await stored.close();
      throw error;
    }
    initLibraryDoc(stored.doc);
  }
  seedLibrary(stored.doc);
  stored.startTabSync();
  return { doc: stored.doc, close: stored.close };
}
