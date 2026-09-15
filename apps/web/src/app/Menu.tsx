import type { KeyboardEvent, ReactNode } from "react";
import { Popover } from "./Popover";

export interface MenuItem {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const ITEM_HEIGHT_PX = 37;

interface MenuProps {
  label: string;
  items: MenuItem[];
  /** 按钮的样式；不给是普通大小的按钮 */
  triggerClassName?: string;
  children: ReactNode;
}

/** 一个按钮 + 一列选项：打开时焦点落在第一项，上下键移动；选了一项就关掉，焦点回到按钮。 */
export function Menu({ label, items, triggerClassName = "btn btn-ghost px-2.5", children }: MenuProps) {
  return (
    <Popover
      label={label}
      trigger={children}
      triggerClassName={triggerClassName}
      role="menu"
      panelClassName="menu"
      align="end"
      estimatedHeight={items.length * ITEM_HEIGHT_PX + 8}
      onPanelKeyDown={moveFocusWithArrows}
    >
      {(close) =>
        items.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            className={item.danger ? "menu-item text-danger" : "menu-item"}
            onClick={() => {
              close(true);
              item.onSelect();
            }}
          >
            {item.label}
          </button>
        ))
      }
    </Popover>
  );
}

function moveFocusWithArrows(event: KeyboardEvent<HTMLDivElement>): void {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  const choices = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)")];
  const current = choices.indexOf(document.activeElement as HTMLButtonElement);
  const step = event.key === "ArrowDown" ? 1 : -1;
  choices[(current + step + choices.length) % choices.length]?.focus();
}
