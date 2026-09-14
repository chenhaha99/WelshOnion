import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { dragLabelPlace } from "./timeline-drag";
import type { PointerLabel } from "./use-timeline-drag";

/**
 * 拖动中松手后的时间，写在指针上方（手指按着的地方看不见）。
 * 放在页面最外层：时间轴卡片有背景模糊，fixed 的元素放在卡片里会按卡片定位。量到字的大小后在画出来之前摆好。
 */
export function DragLabel({ label }: { label: PointerLabel }) {
  const element = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const rect = element.current!.getBoundingClientRect();
    if (rect.width !== size.width || rect.height !== size.height) setSize({ width: rect.width, height: rect.height });
  });
  const place = dragLabelPlace(label, size, document.documentElement.clientWidth);

  return createPortal(
    <div ref={element} data-drag-label className="timeline-drag-label" style={place}>
      {label.text}
    </div>,
    document.body,
  );
}
