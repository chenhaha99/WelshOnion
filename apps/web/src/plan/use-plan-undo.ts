import { createPlanUndoManager } from "@welshonion/core";
import { useEffect, useRef, useState } from "react";
import type * as Y from "yjs";

export interface UndoControls {
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  /** 撤销栈到现在变过几次（加了一步、撤了一步、清空都算）；删完的提示靠它知道之后又改过没有 */
  stackChanges: () => number;
}

/**
 * 计划页的撤销重做，只撤本页做的。Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 或 Ctrl+Y 重做；
 * 焦点在输入框里时不拦截，让输入框自己撤销文字。
 */
export function usePlanUndo(doc: Y.Doc): UndoControls {
  const [manager, setManager] = useState<Y.UndoManager | null>(null);
  const [, setStackVersion] = useState(0);
  // 撤销栈的事件在改动结束时同步发出：改动的函数一返回，这里已经数过了
  const changes = useRef(0);

  useEffect(() => {
    const created = createPlanUndoManager(doc);
    const refresh = () => {
      changes.current += 1;
      setStackVersion(changes.current);
    };
    created.on("stack-item-added", refresh);
    created.on("stack-item-popped", refresh);
    created.on("stack-cleared", refresh);
    setManager(created);

    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || isEditable(event.target)) return;
      const key = event.key.toLowerCase();
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        created.undo();
      } else if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        created.redo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      created.destroy();
    };
  }, [doc]);

  return {
    canUndo: manager?.canUndo() ?? false,
    canRedo: manager?.canRedo() ?? false,
    undo: () => manager?.undo(),
    redo: () => manager?.redo(),
    stackChanges: () => changes.current,
  };
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT")
  );
}
