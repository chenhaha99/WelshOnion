import { createContext, useContext, type ReactNode } from "react";

/** 打开详情面板时焦点放哪：时间轴上点开的放在面板上（手机上不弹键盘），列表「详情…」打开的放在短备注 */
export type PanelFocus = "panel" | "subtitle";

/** 打开一件事的详情面板；opener 是点的那个按钮，关掉面板后焦点回到它。 */
export type OpenBlock = (blockId: string, opener: HTMLElement, focus?: PanelFocus) => void;

/** DayList 给：面板开着哪件放在 DayList，时间轴和列表都从这里打开。 */
export const OpenBlockContext = createContext<OpenBlock | null>(null);

export function useOpenBlock(): OpenBlock {
  const openBlock = useContext(OpenBlockContext);
  if (!openBlock) throw new Error("详情面板只能在 DayList 里面打开");
  return openBlock;
}

interface BlockButtonProps {
  blockId: string;
  /** 读屏名，也是鼠标停上去的提示：「西湖 09:00–12:00」 */
  name: string;
  className: string;
  children: ReactNode;
}

/** 时间轴上的一件事（横条、竖条、「没排时间」栏里的一件）：点了打开它的详情面板。 */
export function BlockButton({ blockId, name, className, children }: BlockButtonProps) {
  const openBlock = useOpenBlock();
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-haspopup="dialog"
      className={className}
      onClick={(event) => openBlock(blockId, event.currentTarget)}
    >
      {children}
    </button>
  );
}
