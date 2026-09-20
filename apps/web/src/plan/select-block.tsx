import type { BlockMark, TagView } from "@welshonion/core";
import { createContext, useContext, type CSSProperties, type ReactNode } from "react";
import { TagRibbon } from "./tag-ribbon";

/**
 * 时间线上选中的是哪一件：DayList 拿着，横条、竖条、「没排时间」栏里的一件都从这里读。
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
  if (!selection) throw new Error("时间线上选中一件事只能在 DayList 里面");
  return selection;
}

interface BlockButtonProps {
  blockId: string;
  /** 读屏名，也是鼠标停上去的提示：「西湖 09:00–12:00」；后面再加标签名和「已完成」 */
  name: string;
  /** 挂着的标签：块上挂一排书签，读屏名里写出名字 */
  tags: readonly TagView[];
  /** 画不画书签：时长为 0 的竖线（横线）上没地方，竖条矮得放不下书签栏时也不画 */
  tagMarks?: boolean;
  /** 三档标记：样子由外面那一层的 data-mark 画 */
  mark: BlockMark;
  className: string;
  children: ReactNode;
}

/**
 * 时间线上的一件事（横条、竖条、「没排时间」栏里的一件）：点一下选中它，再点一下取消；
 * 选中的按钮 aria-pressed 是 true（读屏报得出来），描边在 index.css 里按这个属性画。
 */
export function BlockButton({ blockId, name, tags, tagMarks = true, mark, className, children }: BlockButtonProps) {
  const selection = useBlockSelection();
  const selected = selection.selectedId === blockId;
  // 书签和标记的样子（虚线、变淡、变灰）读屏看不到，名字里写出来：「西湖 09:00–12:00 · 必去、下雨也能去 · 已完成」
  const tagNames = tags.map((tag) => tag.name).join("、");
  const markName = mark === "done" ? "已完成" : mark === "pending" ? "待定" : "";
  const fullName = [name, tagNames, markName].filter((part) => part !== "").join(" · ");
  const marks = tagMarks && tags.length > 0;
  return (
    <button
      type="button"
      aria-label={fullName}
      title={fullName}
      aria-pressed={selected}
      className={className}
      // 只有一行的细条、「没排时间」的一件：右边留出书签那一截，字不压在书签上（见 index.css 的 block-tags）
      style={marks ? ({ "--tag-space": `${tagSpacePx(tags.length)}px` } as CSSProperties) : undefined}
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
      {marks && <BlockTags tags={tags} />}
    </button>
  );
}

/** 最多挂 3 条书签，4 个以上挂 2 条加「+N」 */
const MAX_MARKS = 3;
/** 一条书签 8 像素宽，书签之间隔 2 像素；「+N」大约 12 像素 */
function tagSpacePx(count: number): number {
  return count > MAX_MARKS ? 2 * 8 + 2 + 2 + 12 : count * 8 + (count - 1) * 2;
}

/** 块上的一排书签，从块的上边挂下来、靠右，按标签的顺序；鼠标停上去写名字（读屏名里已经写了，书签对读屏隐藏）。 */
function BlockTags({ tags }: { tags: readonly TagView[] }) {
  const shown = tags.length > MAX_MARKS ? tags.slice(0, 2) : tags;
  return (
    <span data-block-tags aria-hidden title={tags.map((tag) => tag.name).join("、")} className="block-tags">
      {shown.map((tag) => (
        <TagRibbon key={tag.id} color={tag.color} />
      ))}
      {tags.length > MAX_MARKS && <span>+{tags.length - 2}</span>}
    </span>
  );
}
