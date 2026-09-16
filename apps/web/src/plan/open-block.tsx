import { createContext, useContext } from "react";

/** 打开一件事的详情气泡；anchor 是点的那个按钮（气泡贴着它弹出，关掉后焦点回到它）。 */
export type OpenBlock = (blockId: string, anchor: HTMLElement) => void;

/** DayList 给：气泡开着哪件放在 DayList，时间轴和列表都从这里打开。 */
export const OpenBlockContext = createContext<OpenBlock | null>(null);

export function useOpenBlock(): OpenBlock {
  const openBlock = useContext(OpenBlockContext);
  if (!openBlock) throw new Error("详情气泡只能在 DayList 里面打开");
  return openBlock;
}
