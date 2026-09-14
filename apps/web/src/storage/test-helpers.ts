import { IndexeddbPersistence } from "y-indexeddb";
import * as Y from "yjs";

interface Closable {
  close(): Promise<void>;
}

const openHandles = new Set<Closable>();

/** 登记一个打开着的文档，测试结束时统一关掉。 */
export function track<T extends Closable>(handle: T): T {
  openHandles.add(handle);
  return handle;
}

export async function releaseAll(): Promise<void> {
  for (const handle of [...openHandles]) {
    openHandles.delete(handle);
    await handle.close();
  }
}

/** 不经存储模块，直接往本机数据库存一份文档，模拟以前存下的内容。 */
export async function storeDoc(name: string, write: (doc: Y.Doc) => void): Promise<void> {
  const doc = new Y.Doc();
  const persistence = new IndexeddbPersistence(name, doc);
  await persistence.whenSynced;
  write(doc);
  await persistence.destroy();
  doc.destroy();
}

export async function storedDbNames(): Promise<string[]> {
  const databases = await indexedDB.databases();
  return databases.flatMap((db) => (db.name === undefined ? [] : [db.name]));
}
