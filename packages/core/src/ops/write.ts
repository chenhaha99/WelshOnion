import type * as Y from "yjs";

/** 写可以不填的字段：null 就删掉这个键，不存值为 null 的键。 */
export function setOrDelete(map: Y.Map<unknown>, key: string, value: unknown): void {
  if (value === null) {
    map.delete(key);
  } else {
    map.set(key, value);
  }
}
