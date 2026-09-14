import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

/** 外层弹层的面板：弹层里再开的弹层把面板放进去，点它不算「点外面」，外层不会被关掉。 */
const PopoverLayer = createContext<HTMLElement | null>(null);

/** 现在开着的弹层，后开的在后面：页面上的 Esc 只交给最上层的那个。 */
const openPopovers: symbol[] = [];

interface PopoverProps {
  /** 触发按钮的读屏名字；不给就用按钮上的内容 */
  label?: string;
  trigger: ReactNode;
  triggerClassName: string;
  role: "menu" | "dialog";
  panelLabel?: string;
  panelClassName: string;
  /** 面板和按钮哪边对齐 */
  align: "start" | "end";
  /** 面板大概多高（像素），用来决定往下还是往上展开 */
  estimatedHeight: number;
  /** 打开时焦点放哪；不给就放面板里第一个能聚焦的 */
  initialFocus?: (panel: HTMLElement) => HTMLElement | null;
  onPanelKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** close(true) 关掉并把焦点还给按钮 */
  children: (close: (returnFocus?: boolean) => void) => ReactNode;
}

/**
 * 按钮 + 放在页面最外层、按按钮位置摆的面板：不会被会滚动的表格裁掉，也不受背景模糊影响。
 * Esc、点外面、滚动页面、窗口变大小时关掉；Esc 关掉后焦点回到按钮。
 */
export function Popover({
  label,
  trigger,
  triggerClassName,
  role,
  panelLabel,
  panelClassName,
  align,
  estimatedHeight,
  initialFocus,
  onPanelKeyDown,
  children,
}: PopoverProps) {
  const layer = useContext(PopoverLayer);
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const open = position !== null;
  const button = useRef<HTMLButtonElement>(null);
  const token = useRef(Symbol("popover"));
  const panelId = useId();

  const close = useCallback((returnFocus = false) => {
    setPosition(null);
    if (returnFocus) button.current?.focus();
  }, []);

  useEffect(() => {
    if (!open || !panel) return;
    const self = token.current;
    openPopovers.push(self);
    (initialFocus?.(panel) ?? firstFocusable(panel))?.focus();

    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.contains(target) && !button.current?.contains(target)) setPosition(null);
    };
    // 焦点掉出面板时（比如被点的按钮跟着内容一起消失了），Esc 也要关得掉；面板里按的 Esc 由面板自己处理，不会传到这里
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape" && openPopovers.at(-1) === self) {
        event.preventDefault();
        close(true);
      }
    };
    // 面板自己里面滚动（选项很多时）不关
    const closeOnScroll = (event: Event) => {
      if (!panel.contains(event.target as Node)) setPosition(null);
    };
    const closeOnResize = () => setPosition(null);
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
      const index = openPopovers.lastIndexOf(self);
      if (index !== -1) openPopovers.splice(index, 1);
    };
    // 只在打开、面板挂上时跑一次；initialFocus 每次渲染都是新函数，不能放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel]);

  // 面板挂上、还没画出来之前量一下宽度：伸出屏幕左右边的挪回屏幕里（手机上按钮靠右时会伸出去）
  useLayoutEffect(() => {
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const maxLeft = window.innerWidth - rect.width - 8;
    if (rect.left >= 8 && rect.left <= maxLeft) return;
    setPosition(
      (current) => current && { top: current.top, bottom: current.bottom, left: Math.max(8, Math.min(rect.left, maxLeft)) },
    );
  }, [panel]);

  const toggle = () => {
    if (open || !button.current) {
      setPosition(null);
      return;
    }
    const rect = button.current.getBoundingClientRect();
    const roomBelow = window.innerHeight - rect.bottom;
    const placeAbove = roomBelow < estimatedHeight && rect.top > roomBelow;
    setPosition({
      ...(align === "end" ? { right: Math.max(8, window.innerWidth - rect.right) } : { left: Math.max(8, rect.left) }),
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup={role}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        className={triggerClassName}
        onClick={toggle}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={setPanel}
            id={panelId}
            role={role}
            aria-label={panelLabel}
            className={`${panelClassName} fixed z-40`}
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                close(true);
                return;
              }
              onPanelKeyDown?.(event);
            }}
          >
            <PopoverLayer.Provider value={panel}>{children(close)}</PopoverLayer.Provider>
          </div>,
          layer ?? document.body,
        )}
    </>
  );
}

function firstFocusable(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>("button:not(:disabled), input, select, [tabindex]:not([tabindex='-1'])");
}
