import { createContext, useContext } from "react";

/** 「在表里改」：切到列表、分组回到按天，焦点放到这件事的标题框。DayList 给，时间轴上的详情用。 */
export const EditInListContext = createContext<((blockId: string) => void) | null>(null);

export function useEditInList(): (blockId: string) => void {
  const editInList = useContext(EditInListContext);
  if (!editInList) throw new Error("「在表里改」只能用在 DayList 里面");
  return editInList;
}
