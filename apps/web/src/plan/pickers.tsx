import {
  addKind,
  addTag,
  deleteKind,
  deleteTag,
  updateBlock,
  updateExpense,
  updateKind,
  updateTag,
  type BlockView,
  type ExpenseView,
  type KindView,
} from "@welshonion/core";
import type * as Y from "yjs";
import { LibraryPicker } from "./LibraryPicker";

/** 类型这一半：新建、改名、改色、改层、删除。选择器、计划设置里的管理共用；不进撤销。 */
export function kindLibraryActions(library: Y.Doc, countUsing: (kindId: string) => number) {
  return {
    onCreate: ({ name, color }: { name: string; color: string }) => {
      // 新类型的层一律是现有最上层：addKind 不给层就这么定
      const result = addKind(library, { name, color });
      return result.ok ? result.value.kindId : null;
    },
    onRename: (kindId: string, name: string) => updateKind(library, kindId, { name }),
    onRecolor: (kindId: string, color: string) => updateKind(library, kindId, { color }),
    onRelayer: (kindId: string, layer: number) => updateKind(library, kindId, { layer }),
    onDelete: (kindId: string) => deleteKind(library, kindId),
    countUsing,
  };
}

/** 标签这一半：新建、改名、改色、删除（没有层、没有预设）。选择器里的新建、计划设置里的管理共用；不进撤销。 */
export function tagLibraryActions(library: Y.Doc, countUsing: (tagId: string) => number) {
  return {
    onCreate: ({ name, color }: { name: string; color: string }) => {
      const result = addTag(library, { name, color });
      return result.ok ? result.value.tagId : null;
    },
    onRename: (tagId: string, name: string) => updateTag(library, tagId, { name }),
    onRecolor: (tagId: string, color: string) => updateTag(library, tagId, { color }),
    onDelete: (tagId: string) => deleteTag(library, tagId),
    countUsing,
  };
}

interface KindPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  kinds: KindView[];
  /** 当前计划里有几个块在用这个类型 */
  countUsing: (kindId: string) => number;
  /** 快捷条上只画一个点，不写名字 */
  compact?: boolean;
}

/** 块的类型选择器：选类型改块（进撤销）。 */
export function KindPicker({ doc, library, block, kinds, countUsing, compact }: KindPickerProps) {
  return (
    <LibraryPicker
      label="类型"
      current={block.kind}
      options={kinds}
      compact={compact}
      onChoose={(kindId) => updateBlock(doc, library, block.id, { kind_id: kindId })}
      {...kindLibraryActions(library, countUsing)}
    />
  );
}

interface ExpenseKindPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  expense: ExpenseView;
  kinds: KindView[];
  countUsing: (kindId: string) => number;
}

/** 一笔开销的类型选择器：开销自己带类型，可以和挂的块不一样（住宿块上的停车费）。 */
export function ExpenseKindPicker({ doc, library, expense, kinds, countUsing }: ExpenseKindPickerProps) {
  return (
    <LibraryPicker
      label="类型"
      current={expense.kind}
      options={kinds}
      onChoose={(kindId) => updateExpense(doc, library, expense.id, { kind_id: kindId })}
      {...kindLibraryActions(library, countUsing)}
    />
  );
}
