import { createContext, useContext, type ReactNode } from "react";

/**
 * 时间轴上选中的是哪一件：DayList 拿着，横条、竖条、「没排时间」栏里的一件都从这里读。
 * 选中的那件旁边出快捷条（QuickBar）；详情面板从快捷条的「详情…」打开。
 */
export interface BlockSelection {
  /** 选中的那件的 id；没选中是 null */
  selectedId: string | null;
  /** 点的是哪一行（底座 id）：跨午夜的块点哪一段，快捷条就贴哪一段 */
  anchorBaseId: string | null;
  /** 点一下：没选中的选中，已经选中的再点一下取消 */
  toggle: (blockId: string, baseId: string | null) => void;
  select: (blockId: string, baseId: string | null) => void;
  /** 取消选中；focusBlock 为真时焦点回到这件事 */
  clear: (options?: { focusBlock?: boolean }) => void;
}

export const SelectBlockContext = createContext<BlockSelection | null>(null);

export function useBlockSelection(): BlockSelection {
  const selection = useContext(SelectBlockContext);
  if (!selection) throw new Error("时间轴上选中一件事只能在 DayList 里面");
  return selection;
}

interface BlockButtonProps {
  blockId: string;
  /** 读屏名，也是鼠标停上去的提示：「西湖 09:00–12:00」；划掉了末尾再加「 · 划掉了」 */
  name: string;
  /** 划掉了没有：样子由外面那一层的 data-checked 画 */
  checked: boolean;
  className: string;
  children: ReactNode;
}

/**
 * 时间轴上的一件事（横条、竖条、「没排时间」栏里的一件）：点一下选中它，再点一下取消；
 * 选中的按钮 aria-pressed 是 true（读屏报得出来），描边在 index.css 里按这个属性画。
 */
export function BlockButton({ blockId, name, checked, className, children }: BlockButtonProps) {
  const selection = useBlockSelection();
  const selected = selection.selectedId === blockId;
  // 划掉的样子（虚线、变淡、划一道）读屏看不到，名字里写出来
  const fullName = checked ? `${name} · 划掉了` : name;
  return (
    <button
      type="button"
      aria-label={fullName}
      title={fullName}
      aria-pressed={selected}
      className={className}
      onClick={(event) => selection.toggle(blockId, event.currentTarget.closest<HTMLElement>("[data-base-id]")?.dataset.baseId ?? null)}
      onKeyDown={(event) => {
        if (!selected) return;
        if (event.key === "Escape") {
          // 焦点就在这件事上，取消选中不用再挪焦点
          event.stopPropagation();
          selection.clear();
        } else if (event.key === "Tab" && !event.shiftKey) {
          // 快捷条画在这一行下面或屏幕底部，不一定紧挨着这件事：Tab 一下直接进去
          const first = document.querySelector<HTMLElement>(`[data-quick-bar][data-block-id="${blockId}"] button`);
          if (!first) return;
          event.preventDefault();
          first.focus();
        }
      }}
    >
      {children}
    </button>
  );
}
