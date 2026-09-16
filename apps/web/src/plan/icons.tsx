import type { ReactNode } from "react";

/*
 * 界面上的小图标：都画在 16×16 里、用当前文字颜色描线，所以放进按钮就跟着字号和颜色走。
 * 图标按钮自己带读屏名和鼠标提示，图标本身对读屏隐藏。
 */

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

/** 详情：三个点 */
export function DetailsIcon() {
  return (
    <Icon>
      <circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" />
    </Icon>
  );
}

/** 复制：两个叠着的方块 */
export function CopyIcon() {
  return (
    <Icon>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 3.5h-6a1.5 1.5 0 0 0-1.5 1.5v6" />
    </Icon>
  );
}

/** 推迟：钟面加一圈箭头 */
export function ShiftIcon() {
  return (
    <Icon>
      <circle cx="8" cy="8.5" r="5" />
      <path d="M8 6v2.5l1.75 1" />
      <path d="M8 3.5V1.5M6.5 2.5 8 1.5l1.5 1" />
    </Icon>
  );
}

/** 删除：垃圾桶 */
export function TrashIcon() {
  return (
    <Icon>
      <path d="M2.5 4.5h11" />
      <path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" />
      <path d="M4 4.5 4.6 13a1 1 0 0 0 1 .95h4.8a1 1 0 0 0 1-.95L12 4.5" />
    </Icon>
  );
}
