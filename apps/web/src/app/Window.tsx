import { useRef, type ReactNode } from "react";
import { useInitialFocus, type InitialFocus } from "./use-initial-focus";

interface WindowProps {
  /** 标题，也是读屏名 */
  title: string;
  onClose: () => void;
  /** 打开时焦点放哪；不给（或找不到）就放第一个输入框，没有输入框就放在窗口上 */
  initialFocus?: InitialFocus;
  children: ReactNode;
}

/**
 * 窗口外壳：电脑上居中、最宽 560 像素，后面压一层暗底（点暗底关掉）；手机上（宽不到 720 像素）占满屏幕。
 * 标题行钉在顶上，滚到下面也关得掉；Esc、「关闭」关掉。设置这种「停下来改一改」的事用它，
 * 要边看计划边改的（一件事的详情面板）用 Drawer。
 */
export function Window({ title, onClose, initialFocus, children }: WindowProps) {
  const panel = useRef<HTMLElement>(null);
  const downOnBackdrop = useRef(false);
  useInitialFocus(panel, initialFocus);

  return (
    <div
      className="fixed inset-0 z-30 flex bg-ink/20 min-[720px]:items-center min-[720px]:justify-center min-[720px]:p-6"
      // 按下和松手都落在暗底上才算「点外面」：在窗口里按住拖到外面松手不关。
      // 关在 click 上做（不是 pointerdown）：浏览器先把焦点挪到点的地方，我们再把焦点还给打开它的按钮
      onPointerDown={(event) => {
        downOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (downOnBackdrop.current && event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={panel}
        role="dialog"
        aria-label={title}
        aria-modal="true"
        tabIndex={-1}
        className="window flex h-full w-full flex-col overflow-y-auto outline-none min-[720px]:h-auto min-[720px]:max-h-full min-[720px]:w-[35rem] min-[720px]:rounded-2xl"
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        {/* 钉住的标题行自己带不透明底色：内容滚上去时不能从它后面透出来 */}
        <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-6 pt-6 pb-5">
          <h2 className="text-lg font-medium text-ink">{title}</h2>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </header>
        <div className="flex flex-col gap-5 px-6 pb-6">{children}</div>
      </section>
    </div>
  );
}
