import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { beforeEach } from "vitest";

// 每条测试一个全新的本机数据库，互不影响
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});
