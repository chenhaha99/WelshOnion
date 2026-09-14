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

/** 面板离屏幕边至少留多少、离按钮隔多少（像素） */
const VIEWPORT_MARGIN = 8;
const GAP = 4;

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
  /** 面板还没画出来时估计的高度（像素），用来决定先往下还是往上开 */
  estimatedHeight: number;
  /** 打开时焦点放哪；不给就放面板里第一个能聚焦的 */
  initialFocus?: (panel: HTMLElement) => HTMLElement | null;
  onPanelKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** close(true) 关掉并把焦点还给按钮 */
  children: (close: (returnFocus?: boolean) => void) => ReactNode;
}

/**
 * 按钮 + 放在页面最外层、按按钮位置摆的面板：不会被会滚动的表格裁掉，也不受背景模糊影响。
 * 面板始终整个在屏幕里：往下放不下就挑空间大的那边，最大高度按剩余空间封顶，内容在面板里滚。
 * Esc、点外面、窗口变大小时关掉；页面滚动时面板跟着按钮走，按钮滚出屏幕才关；Esc 关掉后焦点回到按钮。
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
    // 滚动不关：浏览器的滚动事件是稍后才送到的，刚滚完页面马上点按钮，面板会被这次「迟到的滚动」关掉。
    // 改成跟着按钮重新摆，按钮整个滚出屏幕才关；每帧最多摆一次
    let frame = 0;
    const reposition = () => {
      frame = 0;
      const trigger = button.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) {
        setPosition(null);
        return;
      }
      setPosition(placePanel(trigger, panel, align, estimatedHeight));
    };
    const scheduleReposition = (event: Event) => {
      // 面板自己里面滚动（选项很多时）不用重摆
      if (event.type === "scroll" && panel.contains(event.target as Node)) return;
      if (frame === 0) frame = requestAnimationFrame(reposition);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("scroll", scheduleReposition, true);
    window.addEventListener("resize", scheduleReposition);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("scroll", scheduleReposition, true);
      window.removeEventListener("resize", scheduleReposition);
      if (frame !== 0) cancelAnimationFrame(frame);
      const index = openPopovers.lastIndexOf(self);
      if (index !== -1) openPopovers.splice(index, 1);
    };
    // 只在打开、面板挂上时跑一次；initialFocus 每次渲染都是新函数，不能放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panel]);

  // 面板挂上、还没画出来之前，按量到的真实宽高再摆一次
  useLayoutEffect(() => {
    if (!panel || !button.current) return;
    setPosition(placePanel(button.current, panel, align, estimatedHeight));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panel]);

  const toggle = () => {
    if (open || !button.current) {
      setPosition(null);
      return;
    }
    setPosition(placePanel(button.current, null, align, estimatedHeight));
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
            className={`${panelClassName} fixed z-40 overflow-y-auto`}
            style={{ ...position, maxWidth: `calc(100vw - ${VIEWPORT_MARGIN * 2}px)` }}
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

/**
 * 按按钮在屏幕上的位置摆面板。面板还没挂上时用估计高度、宽度当 0 算，挂上后再按真实大小摆一次。
 * 往下放不下、上面空间又更大，就往上放；最大高度就是那一边剩下的空间；左右夹在屏幕里。
 */
function placePanel(
  button: HTMLElement,
  panel: HTMLElement | null,
  align: "start" | "end",
  estimatedHeight: number,
): CSSProperties {
  const rect = button.getBoundingClientRect();
  const roomBelow = window.innerHeight - rect.bottom - GAP - VIEWPORT_MARGIN;
  const roomAbove = rect.top - GAP - VIEWPORT_MARGIN;
  const wantedHeight = panel ? panel.scrollHeight : estimatedHeight;
  const placeAbove = wantedHeight > roomBelow && roomAbove > roomBelow;

  const width = panel ? panel.offsetWidth : 0;
  const preferredLeft = align === "end" ? rect.right - width : rect.left;
  const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, window.innerWidth - width - VIEWPORT_MARGIN));

  return placeAbove
    ? { left, bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.max(0, roomAbove) }
    : { left, top: rect.bottom + GAP, maxHeight: Math.max(0, roomBelow) };
}

function firstFocusable(panel: HTMLElement): HTMLElement | null {
  return panel.querySelector<HTMLElement>("button:not(:disabled), input, select, [tabindex]:not([tabindex='-1'])");
}
