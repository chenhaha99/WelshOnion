import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { UndoControls } from "./use-plan-undo";

/** 提示停留多久 */
const SHOW_MS = 8_000;

export interface DoneNotice {
  /** 提示的字，比如「删掉了「西湖」」 */
  message: string;
  /** 撤销后焦点落到哪（CSS 选择器）；回来的东西找不到就不动 */
  focusAfterUndo: string;
}

const NotifyContext = createContext<((done: DoneNotice) => void) | null>(null);
/** 屏幕底部正显示着刚做完的提示：底部还有别的东西（手机上的快捷条）时要给它让位 */
const ShownContext = createContext(false);

export function useNoticeShown(): boolean {
  return useContext(ShownContext);
}

/** 计划页里删东西的地方，删完用它出提示。 */
export function useNotifyDone(): (done: DoneNotice) => void {
  const notify = useContext(NotifyContext);
  if (!notify) throw new Error("刚做完的提示只在计划页里用");
  return notify;
}

interface Shown extends DoneNotice {
  /** 出提示时撤销栈变过几次：之后数一变，提示里的「撤销」撤的就不是这次删除了 */
  stackChanges: number;
  /** 每出一次加一：连着出两条一样的字也重新计时 */
  serial: number;
}

/**
 * 刚做完的提示：屏幕底部一条「删掉了……」和「撤销」。8 秒后、之后又改了计划、撤销或重做就不显示；又删了别的换成新的。
 * 放提示的 status 区域一直在页面上，新出来的字读屏才会读。
 */
export function DoneNotice({ undo, children }: { undo: UndoControls; children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const serial = useRef(0);
  const stackChanges = useRef(undo.stackChanges);
  stackChanges.current = undo.stackChanges;

  const notify = useCallback((done: DoneNotice) => {
    serial.current += 1;
    setShown({ ...done, stackChanges: stackChanges.current(), serial: serial.current });
  }, []);

  const visible = shown !== null && shown.stackChanges === undo.stackChanges() ? shown : null;
  const visibleSerial = visible?.serial;
  useEffect(() => {
    if (visibleSerial === undefined) return;
    const timer = setTimeout(() => setShown((current) => (current?.serial === visibleSerial ? null : current)), SHOW_MS);
    return () => clearTimeout(timer);
  }, [visibleSerial]);

  return (
    <NotifyContext.Provider value={notify}>
      <ShownContext.Provider value={visible !== null}>{children}</ShownContext.Provider>
      <div
        role="status"
        aria-label="刚做完的提示"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        {visible && (
          <div
            data-done-notice
            className="pointer-events-auto flex max-w-full items-center gap-3 rounded-2xl bg-ink py-2 pr-2 pl-4 text-sm text-white shadow-lg"
          >
            <span className="min-w-0 break-words">{visible.message}</span>
            <button
              type="button"
              className="shrink-0 rounded-xl bg-white/15 px-3 py-1.5 font-medium hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white"
              onClick={() => {
                undo.undo();
                // 按钮点完就没了，焦点会掉到页面最外面：等回来的东西画出来，把焦点放上去
                requestAnimationFrame(() => document.querySelector<HTMLElement>(visible.focusAfterUndo)?.focus());
              }}
            >
              撤销
            </button>
          </div>
        )}
      </div>
    </NotifyContext.Provider>
  );
}
