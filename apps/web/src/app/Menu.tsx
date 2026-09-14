import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const ITEM_HEIGHT_PX = 37;

/**
 * 一个按钮 + 一列选项。打开时焦点落在第一项，上下键移动；
 * Esc、点外面、滚动页面、选了一项都会关掉，Esc 和选项关掉后焦点回到按钮。
 * 选项列表放到页面最外层、按按钮位置摆：不会被会横向滚动的表格裁掉，也不受行的背景模糊影响。
 */
export function Menu({ label, items, children }: { label: string; items: MenuItem[]; children: ReactNode }) {
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const open = position !== null;
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    enabledItems(menu.current)[0]?.focus();
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setPosition(null);
    };
    const close = () => setPosition(null);
    document.addEventListener("pointerdown", closeIfOutside);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", closeIfOutside);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const toggle = () => {
    if (open || !button.current) {
      setPosition(null);
      return;
    }
    const rect = button.current.getBoundingClientRect();
    const estimatedHeight = items.length * ITEM_HEIGHT_PX + 8;
    const roomBelow = window.innerHeight - rect.bottom;
    const placeAbove = roomBelow < estimatedHeight && rect.top > roomBelow;
    setPosition({
      right: Math.max(8, window.innerWidth - rect.right),
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  const closeAndReturnFocus = () => {
    setPosition(null);
    button.current?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      closeAndReturnFocus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const choices = enabledItems(menu.current);
    const current = choices.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowDown" ? 1 : -1;
    choices[(current + step + choices.length) % choices.length]?.focus();
  };

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="btn btn-ghost px-2.5"
        onClick={toggle}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={menuId}
            role="menu"
            className="menu fixed z-40"
            style={position}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                className={item.danger ? "menu-item text-danger" : "menu-item"}
                onClick={() => {
                  closeAndReturnFocus();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

function enabledItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return menu ? [...menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")] : [];
}
