import { useEffect, type RefObject } from "react";

/** 打开时焦点放哪：给面板元素，返回要聚焦的那个；返回 null 就按默认来 */
export type InitialFocus = (panel: HTMLElement) => HTMLElement | null;

/**
 * 弹出来的面板打开时放一次焦点：给了就按给的放，没给（或找不到）就放第一个输入框，再没有就放面板本身。
 * 抽屉（Drawer）和窗口（Window）共用。
 */
export function useInitialFocus(panel: RefObject<HTMLElement | null>, initialFocus?: InitialFocus): void {
  useEffect(() => {
    const element = panel.current!;
    (initialFocus?.(element) ?? element.querySelector<HTMLElement>('input:not([type="file"])') ?? element).focus();
    // 只在打开时放一次；initialFocus 每次渲染都是新函数，不能放进依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
