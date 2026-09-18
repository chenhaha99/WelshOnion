import { useEffect, useRef, type PointerEvent, type RefObject } from "react";

/** 鼠标离开页顶那一行和弹出来那截多久才收回去：从一截挪到另一截、手抖出界一下都不会一闪 */
const CLOSE_DELAY = 300;
/** 弹出来、收回去的淡入下滑、淡出上滑多长 */
const SLIDE = 150;
const HIDDEN: Keyframe = { opacity: 0, transform: "translateY(-0.5rem)" };

/**
 * 计划页顶上「鼠标移上去弹出来」（你提的：鼠标在上面区域的时候，就自动弹出来）。
 * 鼠标进了页顶那一行或弹出来那截，给 area 标上 data-top-peek，CSS 按它把筛选和切换按钮钉在页顶那一行下面；
 * 离开 0.3 秒后去掉。只认鼠标：手指点一下也会进出，触屏上用「展开」。
 * 页顶那一行钉住了、没固定时才淡入淡出：页面在最上面时那截就在原处，固定了一直在，都不用动；系统设了减少动态效果也不动。
 * 直接改属性、不走 state：弹出来、收回去不用重画整个计划。
 */
export function useTopPeek(area: RefObject<HTMLElement | null>, drawer: RefObject<HTMLElement | null>) {
  const timer = useRef(0);
  const closing = useRef<Animation | null>(null);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const slides = () => {
    const focused = document.activeElement;
    return (
      area.current!.hasAttribute("data-stuck") &&
      !area.current!.hasAttribute("data-top-pinned") &&
      // 键盘走进了那截：它靠焦点弹着，去掉 data-top-peek 也不收
      !(focused !== null && drawer.current!.contains(focused) && focused.matches(":focus-visible")) &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  };

  const onPointerEnter = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    if (closing.current !== null) {
      // 正在收：停下，接着弹着
      closing.current.cancel();
      closing.current = null;
      return;
    }
    if (area.current!.hasAttribute("data-top-peek")) return;
    const slide = slides();
    area.current!.setAttribute("data-top-peek", "");
    if (slide) drawer.current!.animate([HIDDEN, {}], { duration: SLIDE, easing: "ease-out" });
  };

  const onPointerLeave = (event: PointerEvent) => {
    if (event.pointerType !== "mouse") return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const shut = () => area.current?.removeAttribute("data-top-peek");
      if (!slides()) return shut();
      const animation = drawer.current!.animate([{}, HIDDEN], { duration: SLIDE, easing: "ease-in", fill: "forwards" });
      closing.current = animation;
      // 淡出完了：先去掉属性再撤掉动画，那截回到页面里本来的位置（早滚走了），不会先闪一下。
      // 用计时器，不等动画的 finish 事件：页面没在重画时它会晚到，那截就一直停在看不见、却还挡着的样子
      timer.current = window.setTimeout(() => {
        shut();
        animation.cancel();
        closing.current = null;
      }, SLIDE);
    }, CLOSE_DELAY);
  };

  return { onPointerEnter, onPointerLeave };
}
