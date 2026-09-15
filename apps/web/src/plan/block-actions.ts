import { deleteBlock, moveUndated, setBlockIndent, type BlockView, type PlanView } from "@welshonion/core";
import type * as Y from "yjs";
import type { MenuItem } from "../app/Menu";
import type { Deleted } from "./DeletedNotice";

/**
 * 这件事现在在页面上的按钮：时间轴上是它的横条、竖条或栏里的一件，列表里是它的行菜单按钮。
 * 关掉详情面板后找回焦点、撤销删除后放焦点用；两个视图一次只画一个，找到的就是看得见的那个。
 */
export function blockFocusSelector(blockId: string): string {
  return [
    `tr[data-block-id="${blockId}"] button[aria-label="这件事的操作"]`,
    `[data-segment][data-block-id="${blockId}"] > button`,
    `[data-undated-chip][data-block-id="${blockId}"] > button`,
  ].join(", ");
}

/** 没排时间的事：缩进或取消缩进，在这一格里上移、下移（到头的那个方向不能点）。行菜单和详情面板共用。 */
export function undatedArrangeItems(doc: Y.Doc, plan: PlanView, block: BlockView): MenuItem[] {
  const slot = block.slot ?? "day";
  const group = plan.undated.get(block.start_base_id)?.[slot] ?? [];
  const position = group.indexOf(block.id);
  return [
    (block.indent ?? 0) === 0
      ? { label: "缩进", onSelect: () => setBlockIndent(doc, block.id, 1) }
      : { label: "取消缩进", onSelect: () => setBlockIndent(doc, block.id, null) },
    {
      label: "上移",
      disabled: position <= 0,
      onSelect: () => moveUndated(doc, block.id, { slot, beforeId: group[position - 1] }),
    },
    {
      label: "下移",
      disabled: position === -1 || position >= group.length - 1,
      // 放到下下个前面；后面没有了就放最后
      onSelect: () => moveUndated(doc, block.id, { slot, beforeId: group[position + 2] }),
    },
  ];
}

/** 删除的字：套着会被带走的块时写明几个。 */
export function deleteLabel(followerCount: number): string {
  return followerCount > 0 ? `删除（连同里面的 ${followerCount} 个）` : "删除";
}

/** 删掉这件事（连同会被带走的块），返回删完的提示：删除不再确认，靠撤销。 */
export function deleteBlockWithNotice(doc: Y.Doc, library: Y.Doc, block: BlockView, followerCount: number): Deleted {
  deleteBlock(doc, library, block.id);
  return {
    message: followerCount > 0 ? `删掉了「${block.title}」和里面的 ${followerCount} 件` : `删掉了「${block.title}」`,
    focusAfterUndo: blockFocusSelector(block.id),
  };
}
