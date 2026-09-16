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

/** 加一件事：一个加号 */
export function PlusIcon() {
  return (
    <Icon>
      <path d="M8 3.5v9M3.5 8h9" />
    </Icon>
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
export function GearIcon() {
  return (
    <Icon>
      {/* 八个齿连成一圈（齿顶 6、齿根 4.3）+ 中间的孔；原来是圆加八条射线，看着像太阳 */}
      <path d="M8 2 L9.65 4.03 L12.24 3.76 L11.97 6.35 L14 8 L11.97 9.65 L12.24 12.24 L9.65 11.97 L8 14 L6.35 11.97 L3.76 12.24 L4.03 9.65 L2 8 L4.03 6.35 L3.76 3.76 L6.35 4.03 Z" />
      <circle cx="8" cy="8" r="2.2" />
    </Icon>
  );
}

/** 撤销：往左拐回去的箭头 */
export function UndoIcon() {
  return (
    <Icon>
      <path d="M3.25 7.5h7a3.25 3.25 0 1 1 0 6.5H6.5" />
      <path d="m6 4.5-2.75 3L6 10.5" />
    </Icon>
  );
}

/** 重做：往右拐回去的箭头 */
export function RedoIcon() {
  return (
    <Icon>
      <path d="M12.75 7.5h-7a3.25 3.25 0 1 0 0 6.5H9.5" />
      <path d="m10 4.5 2.75 3L10 10.5" />
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
