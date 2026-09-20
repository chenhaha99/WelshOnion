import {
  setBlockKind,
  setBlockMark,
  setBlockTag,
  type BlockMark,
  type BlockView,
  type LibraryView,
} from "@welshonion/core";
import type * as Y from "yjs";
import type { MenuItem } from "../app/Menu";
import type { DoneNotice } from "./DoneNotice";
import { MARK_LABEL } from "./mark";

/** 对一批事一起做的三样：换标记、挂摘标签、改类型。做完焦点回到点开这个菜单的按钮。 */
interface BulkInput {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  /** 看得见的那几件（已经过筛选） */
  blocks: readonly BlockView[];
  notify: (done: DoneNotice) => void;
  /** 撤销后焦点落到哪 */
  focusAfterUndo: string;
}

const MARKS: BlockMark[] = ["pending", "decided", "done"];

const MARK_MENU: Record<BlockMark, string> = {
  pending: "设成待定",
  decided: "设成确定",
  done: "设成完成",
};

/**
 * 「对这 N 件…」和每天菜单里「这天全部…」共用的一列：
 * 三档标记各一项（这几件已经都是那一档时按不了）、加标签…、摘标签…、改类型…（后三样在同一个面板里换成二级）。
 * 每样在 core 里都是一个事务，所以撤销一下全回来。
 */
export function bulkItems({ doc, library, libraryView, blocks, notify, focusAfterUndo }: BulkInput): MenuItem[] {
  const ids = blocks.map((block) => block.id);
  const count = ids.length;
  const done = (message: string) => notify({ message, focusAfterUndo });

  const tags = [...libraryView.tags.values()].sort((a, b) => a.order - b.order);
  const onIds = new Set(blocks.flatMap((block) => block.tag_ids));
  const onBlocks = tags.filter((tag) => onIds.has(tag.id));

  return [
    ...MARKS.map((mark) => ({
      label: MARK_MENU[mark],
      disabled: blocks.every((block) => block.mark === mark),
      onSelect: () => {
        setBlockMark(doc, ids, mark);
        done(`${count} 件事的标记都改成了「${MARK_LABEL[mark]}」`);
      },
    })),
    {
      label: "加标签…",
      disabled: tags.length === 0,
      submenu: tags.map((tag) => ({
        label: tag.name,
        onSelect: () => {
          setBlockTag(doc, library, ids, tag.id, true);
          done(`${count} 件事都挂上了「${tag.name}」`);
        },
      })),
    },
    {
      label: "摘标签…",
      disabled: onBlocks.length === 0,
      submenu: onBlocks.map((tag) => ({
        label: tag.name,
        onSelect: () => {
          setBlockTag(doc, library, ids, tag.id, false);
          done(`${count} 件事都摘掉了「${tag.name}」`);
        },
      })),
    },
    {
      label: "改类型…",
      submenu: [...libraryView.kinds.values()]
        .sort((a, b) => a.order - b.order)
        .map((kind) => ({
          label: kind.name,
          onSelect: () => {
            setBlockKind(doc, library, ids, kind.id);
            done(`${count} 件事都改成了「${kind.name}」`);
          },
        })),
    },
  ];
}
