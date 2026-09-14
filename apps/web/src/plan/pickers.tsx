import {
  addKind,
  addStatus,
  deleteKind,
  deleteStatus,
  setBlockStatus,
  updateBlock,
  updateExpense,
  updateKind,
  updateStatus,
  type BlockView,
  type ExpenseView,
  type KindView,
  type StatusView,
} from "@welshonion/core";
import type * as Y from "yjs";
import { LibraryPicker } from "./LibraryPicker";

/** 类型选择器里写资料库的那一半（新建、改名、改色、改层、删除），块和钱共用；不进撤销。 */
function kindLibraryActions(library: Y.Doc, countUsing: (kindId: string) => number) {
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

interface KindPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  kinds: KindView[];
  /** 当前计划里有几个块在用这个类型 */
  countUsing: (kindId: string) => number;
}

/** 块的类型选择器：选类型改块（进撤销）。 */
export function KindPicker({ doc, library, block, kinds, countUsing }: KindPickerProps) {
  return (
    <LibraryPicker
      label="类型"
      current={block.kind}
      options={kinds}
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

/** 一笔钱的类型选择器：钱自己带类型，可以和挂的块不一样（住宿块上的停车费）。 */
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

interface StatusPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  statuses: StatusView[];
  /** 当前计划里有几个块在用这个状态 */
  countUsing: (statusId: string) => number;
}

/** 块的状态选择器：和类型一样，只是没有层。 */
export function StatusPicker({ doc, library, block, statuses, countUsing }: StatusPickerProps) {
  return (
    <LibraryPicker
      label="状态"
      current={block.status}
      options={statuses}
      onChoose={(statusId) => setBlockStatus(doc, library, [block.id], statusId)}
      onCreate={({ name, color }) => {
        const result = addStatus(library, { name, color });
        return result.ok ? result.value.statusId : null;
      }}
      onRename={(statusId, name) => updateStatus(library, statusId, { name })}
      onRecolor={(statusId, color) => updateStatus(library, statusId, { color })}
      onDelete={(statusId) => deleteStatus(library, statusId)}
      countUsing={countUsing}
    />
  );
}
