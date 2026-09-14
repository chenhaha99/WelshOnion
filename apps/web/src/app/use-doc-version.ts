import { useCallback, useSyncExternalStore } from "react";
import type * as Y from "yjs";

const counters = new WeakMap<Y.Doc, { value: number }>();

/**
 * 每份文档一个改动计数器。第一次用到时就开始计数，
 * 所以「渲染完、还没订阅上」之间发生的改动也不会漏掉。
 */
function counterOf(doc: Y.Doc): { value: number } {
  let counter = counters.get(doc);
  if (!counter) {
    const created = { value: 0 };
    doc.on("update", () => {
      created.value += 1;
    });
    counters.set(doc, created);
    counter = created;
  }
  return counter;
}

/** 文档每改一次，返回值就变；拿它当 useMemo 的依赖，文档一变就重读。 */
export function useDocVersion(doc: Y.Doc): number {
  const counter = counterOf(doc);
  const subscribe = useCallback(
    (onChange: () => void) => {
      doc.on("update", onChange);
      return () => doc.off("update", onChange);
    },
    [doc],
  );
  return useSyncExternalStore(subscribe, () => counter.value);
}
