import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { placePanel, VIEWPORT_MARGIN } from "./place-panel";
import { useInitialFocus, type InitialFocus } from "./use-initial-focus";
import { useWideScreen } from "./use-wide-screen";

interface AnchoredCardProps {
  /** 贴着谁弹出（打开它的那个按钮） */
  anchor: HTMLElement;
  /** 标题，也是读屏名 */
  title: string;
  /** 面板还没画出来时估计的高度（像素），用来决定先往下还是往上开 */
  estimatedHeight: number;
  onClose: () => void;
  /** 打开时焦点放哪；不给（或找不到）就放第一个输入框，没有输入框就放在面板上 */
  initialFocus?: InitialFocus;
  /** 手机上怎么摆：从底部浮起（后面压暗底，点暗底关掉），还是占满屏幕；不给是占满 */
  phone?: "sheet" | "full";
  children: ReactNode;
}

/**
 * 贴着某个按钮弹出的气泡（不是抽屉）：电脑上浮在那个按钮下面（放不下就往上）；手机上（宽不到 720 像素）占满屏幕，
 * 或者从屏幕底部浮起（最高八成屏幕高，后面压一层暗底，点暗底关掉）。
 * Esc、点外面、「关闭」关掉；页面滚动时跟着按钮走，按钮整个滚出屏幕就关掉。放在页面最外层，不会被会滚动的框裁掉。
 * 和弹层（Popover）共用同一份摆放算法（place-panel），区别是它贴的按钮在别处、开不开由外面定。
 */
export function AnchoredCard({
  anchor,
  title,
  estimatedHeight,
  onClose,
  initialFocus,
  phone = "full",
  children,
}: AnchoredCardProps) {
  const wide = useWideScreen();
  const sheet = !wide && phone === "sheet";
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // 写死这一个回调：每次渲染换新函数的话，React 会先用 null 调一遍再用元素调一遍，面板会一直重新挂
  const takePanel = useCallback((element: HTMLElement | null) => {
    panelRef.current = element;
    setPanel(element);
  }, []);
  useInitialFocus(panelRef, initialFocus);

  // 点外面、Esc 关掉；滚动时跟着按钮走（按钮整个滚出屏幕才关），窗口变大小只重新摆
  useEffect(() => {
    if (!panel || !wide) return;
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.contains(target) && !anchor.contains(target)) close.current();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") close.current();
    };
    let frame = 0;
    let scrolled = false;
    const reposition = () => {
      frame = 0;
      const byScroll = scrolled;
      scrolled = false;
      const rect = anchor.getBoundingClientRect();
      if (byScroll && (rect.bottom < 0 || rect.top > window.innerHeight)) {
        close.current();
        return;
      }
      setPosition(placePanel(anchor, panel, "start", estimatedHeight));
    };
    const schedule = (event: Event) => {
      if (event.type === "scroll") {
        if (panel.contains(event.target as Node)) return;
        scrolled = true;
      }
      if (frame === 0) frame = requestAnimationFrame(reposition);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
      if (frame !== 0) cancelAnimationFrame(frame);
    };
  }, [panel, wide, anchor, estimatedHeight]);

  // 挂上、量到真实大小以后再摆一次
  useLayoutEffect(() => {
    if (!panel || !wide) return;
    setPosition(placePanel(anchor, panel, "start", estimatedHeight));
  }, [panel, wide, anchor, estimatedHeight]);

  const card = (
    <section
      ref={takePanel}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      data-sheet={sheet || undefined}
      className={
        wide
          ? "menu fixed z-30 flex w-80 flex-col overflow-y-auto outline-none"
          : sheet
            ? "sheet fixed inset-x-0 bottom-0 z-30 flex max-h-[80dvh] flex-col overflow-y-auto outline-none"
            : "drawer fixed inset-0 z-30 flex h-full w-full flex-col overflow-y-auto outline-none"
      }
      // 位置在 useLayoutEffect 里摆好（画出来之前），不用先藏起来——藏起来的元素拿不到焦点
      style={wide ? { ...position, maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)` } : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between bg-white px-4 pt-4 pb-3">
        <h2 className="text-base font-medium text-ink">{title}</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      </header>
      <div className="flex flex-col gap-4 px-4 pb-4">{children}</div>
    </section>
  );

  return createPortal(
    <>
      {/* 底部浮起时后面压一层暗底：点了关掉，也点不到后面的时间轴（点外面多半是想点别的事，关掉又选中别的容易乱） */}
      {sheet && <div data-card-backdrop aria-hidden className="fixed inset-0 z-30 bg-ink/25" onClick={onClose} />}
      {card}
    </>,
    document.body,
  );
}
