import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

/**
 * 一个按钮 + 一列选项。打开时焦点落在第一项，上下键移动；
 * Esc、点外面、选了一项都会关掉，Esc 和选项关掉后焦点回到按钮。
 */
export function Menu({ label, items, children }: { label: string; items: MenuItem[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    enabledItems(menu.current)[0]?.focus();
    const closeIfOutside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu.current?.contains(target) && !button.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeIfOutside);
    return () => document.removeEventListener("pointerdown", closeIfOutside);
  }, [open]);

  const closeAndReturnFocus = () => {
    setOpen(false);
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
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className="btn btn-ghost px-2.5"
        onClick={() => setOpen((value) => !value)}
      >
        {children}
      </button>
      {open && (
        <div ref={menu} id={menuId} role="menu" className="menu absolute top-full right-0 mt-1" onKeyDown={onMenuKeyDown}>
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
        </div>
      )}
    </div>
  );
}

function enabledItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return menu ? [...menu.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")] : [];
}
