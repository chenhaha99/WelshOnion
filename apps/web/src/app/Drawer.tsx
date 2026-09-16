import { useRef, type ReactNode } from "react";
import { useInitialFocus, type InitialFocus } from "./use-initial-focus";

interface DrawerProps {
  /** 标题，也是读屏名 */
  title: string;
  onClose: () => void;
  /** 打开时焦点放哪；不给（或找不到）就放第一个输入框，没有输入框就放在面板上 */
  initialFocus?: InitialFocus;
  children: ReactNode;
}

/**
 * 抽屉外壳：电脑上从右边滑出、320 像素宽，不盖住左边的内容；手机上（宽不到 720 像素）占满屏幕，露出的一条看不清还会误点。
 * 标题行钉在顶上，滚到下面也关得掉；Esc、「关闭」关掉。打开时焦点放在给的地方，默认是第一个输入框，没有输入框就放在面板上。
 */
export function Drawer({ title, onClose, initialFocus, children }: DrawerProps) {
  const panel = useRef<HTMLElement>(null);
  useInitialFocus(panel, initialFocus);

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      className="drawer fixed top-0 right-0 z-30 flex h-full w-full flex-col overflow-y-auto outline-none min-[720px]:w-80"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      {/* 钉住的标题行自己带不透明的底色和边距：抽屉要是有内边距，钉住的标题停在边距下面，滚上去的栏会从边距里露出来；
          底色半透明时（试过 95% 的白）滚上去的栏也会透出来 */}
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-6 pt-6 pb-5">
        <h2 className="text-lg font-medium text-ink">{title}</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="flex flex-col gap-5 px-6 pb-6">{children}</div>
    </aside>
  );
}
