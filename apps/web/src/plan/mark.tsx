import { nextMark, setBlockMark, type BlockMark, type BlockView } from "@welshonion/core";
import type * as Y from "yjs";
import type { MenuItem } from "../app/Menu";

/** 三档标记在界面上的叫法（你提的：设想、确定、完成三个流程；词是 AI 挑的） */
export const MARK_LABEL: Record<BlockMark, string> = {
  pending: "待定",
  decided: "定了",
  struck: "划掉",
};

/** 三档的圆圈：待定是虚线空心圈，定了是实线空心圈，划掉是实心打勾。 */
export function MarkIcon({ mark }: { mark: BlockMark }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" className="size-4 shrink-0" fill="none">
      <circle
        cx="8"
        cy="8"
        r="6.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray={mark === "pending" ? "3 2.5" : undefined}
        fill={mark === "struck" ? "currentColor" : "none"}
      />
      {mark === "struck" && (
        <path d="m5.3 8.2 1.9 1.9 3.5-3.6" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

interface MarkButtonProps {
  doc: Y.Doc;
  block: BlockView;
  className: string;
}

/**
 * 换标记的按钮：点一下换下一档（定了 → 划掉 → 待定 → 定了）。
 * 日程竖线上的圆圈、时间线快捷条第一个按钮都是它，样子一样。
 * 读屏名写现在这一档，鼠标提示写按一下会变成什么；不用勾选框：勾选框只有两档，三档读屏会读错。
 */
export function MarkButton({ doc, block, className }: MarkButtonProps) {
  const next = nextMark(block.mark);
  return (
    <button
      type="button"
      data-mark-button
      aria-label={`标记：${MARK_LABEL[block.mark]}`}
      title={`按一下设成「${MARK_LABEL[next]}」`}
      className={className}
      onClick={() => setBlockMark(doc, [block.id], next)}
    >
      <MarkIcon mark={block.mark} />
    </button>
  );
}

/** 三档在菜单里怎么写：不熟的人、用读屏的人不用猜点几下 */
const MARK_MENU: Record<BlockMark, string> = {
  pending: "设成待定",
  decided: "设成定了",
  struck: "划掉",
};

/** 「这件事的操作」菜单里换标记的三项：现在这一档按不了。 */
export function markItems(doc: Y.Doc, block: BlockView): MenuItem[] {
  return (["pending", "decided", "struck"] as BlockMark[]).map((mark) => ({
    label: MARK_MENU[mark],
    disabled: block.mark === mark,
    onSelect: () => setBlockMark(doc, [block.id], mark),
  }));
}
