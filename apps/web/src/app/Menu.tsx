import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Popover } from "./Popover";

export interface MenuItem {
  label: string;
  /** 有 submenu 时不用给 */
  onSelect?: () => void;
  /** 二级：点了在同一个面板里换成这一列，第一项是「← 返回」 */
  submenu?: MenuItem[];
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

/**
 * 一个按钮 + 一列选项：打开时焦点落在第一项，上下键移动；选了一项就关掉，焦点回到按钮。
 * 有二级的项（「加标签…」这种）点了不关，在同一个面板里换成二级那一列——再弹一层会盖住按钮，手机上尤其乱。
 */
export function Menu({ label, items, triggerClassName = "btn btn-ghost px-2.5", children }: MenuProps) {
  const deepest = Math.max(items.length, ...items.map((item) => (item.submenu?.length ?? 0) + 1));
  return (
    <Popover
      label={label}
      trigger={children}
      triggerClassName={triggerClassName}
      role="menu"
      panelClassName="menu"
      align="end"
      estimatedHeight={deepest * ITEM_HEIGHT_PX + 8}
      onPanelKeyDown={moveFocusWithArrows}
    >
      {(close) => <MenuList items={items} close={close} />}
    </Popover>
  );
}

function MenuList({ items, close }: { items: MenuItem[]; close: (returnFocus?: boolean) => void }) {
  // 进了哪一项的二级；null 是第一层
  const [opened, setOpened] = useState<MenuItem | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  // 换到二级那一列后，焦点放到「← 返回」上：接着用上下键走
  useEffect(() => {
    if (opened !== null) first.current?.focus();
  }, [opened]);

  const back: MenuItem = { label: "← 返回" };
  const shown: MenuItem[] = opened === null ? items : [back, ...(opened.submenu ?? [])];

  return (
    <>
      {shown.map((item, index) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          disabled={item.disabled}
          ref={index === 0 ? first : undefined}
          className={item.danger ? "menu-item text-danger" : "menu-item"}
          onClick={() => {
            if (item === back) {
              setOpened(null);
              return;
            }
            if (item.submenu) {
              setOpened(item);
              return;
            }
            close(true);
            item.onSelect?.();
          }}
        >
          {item.label}
        </button>
      ))}
    </>
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
