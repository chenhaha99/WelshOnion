import { DocumentError } from "@welshonion/core";
import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";
import { connectTabs } from "./tab-sync";

/** 交给界面的打开着的文档。 */
export interface DocHandle {
  readonly doc: Y.Doc;
  close(): Promise<void>;
}

export interface StoredDoc extends DocHandle {
  /** 版本检查、初始化做完之后再接上标签页同步。 */
  startTabSync(): void;
}

/** 建文档、接上本机存储，等本机已存的内容加载完再返回。 */
export async function loadStoredDoc(name: string): Promise<StoredDoc> {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(name, doc);
  await persistence.whenSynced;
  let disconnectTabs: (() => void) | null = null;
  return {
    doc,
    startTabSync: () => {
      disconnectTabs = connectTabs(doc, name);
    },
    close: async () => {
      disconnectTabs?.();
      await persistence.destroy();
      doc.destroy();
    },
  };
}

/** 等删除真正完成才返回（y-indexeddb 的 clearData 不等）。 */
export function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function storedDbNames(): Promise<string[]> {
  const databases = await indexedDB.databases();
  return databases.flatMap((db) => (db.name === undefined ? [] : [db.name]));
}

export function isNotInitialized(error: unknown): boolean {
  return error instanceof DocumentError && error.code === "NOT_INITIALIZED";
}
