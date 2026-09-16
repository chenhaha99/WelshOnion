import { createContext, useContext } from "react";

/**
 * 打开详情面板时焦点放哪：从快捷条的「详情…」打开的放在面板上（手机上不弹键盘），
 * 列表「详情…」打开的放在短备注（备注收起着时放在「加备注」），快捷条的「开销」写不下时展开开销的编辑区。
 */
export type PanelFocus = "panel" | "subtitle" | "money";

/** 打开一件事的详情面板；opener 是点的那个按钮，关掉面板后焦点回到它。 */
export type OpenBlock = (blockId: string, opener: HTMLElement, focus?: PanelFocus) => void;

/** DayList 给：面板开着哪件放在 DayList，时间轴和列表都从这里打开。 */
export const OpenBlockContext = createContext<OpenBlock | null>(null);

export function useOpenBlock(): OpenBlock {
  const openBlock = useContext(OpenBlockContext);
  if (!openBlock) throw new Error("详情面板只能在 DayList 里面打开");
  return openBlock;
}
