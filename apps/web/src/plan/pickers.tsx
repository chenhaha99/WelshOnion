import {
  addKind,
  addStatus,
  deleteKind,
  deleteStatus,
  setBlockStatus,
  updateBlock,
  updateKind,
  updateStatus,
  type BlockView,
  type KindView,
  type StatusView,
} from "@welshonion/core";
import type * as Y from "yjs";
import { LibraryPicker } from "./LibraryPicker";

interface KindPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  kinds: KindView[];
  /** 当前计划里有几个块在用这个类型 */
  countUsing: (kindId: string) => number;
}

/** 块的类型选择器：选类型改块（进撤销）；新建、改名、改色、改层、删除写资料库（不进撤销）。 */
export function KindPicker({ doc, library, block, kinds, countUsing }: KindPickerProps) {
  return (
    <LibraryPicker
      label="类型"
      current={block.kind}
      options={kinds}
      onChoose={(kindId) => updateBlock(doc, library, block.id, { kind_id: kindId })}
      onCreate={({ name, color }) => {
        // 新类型的层一律是现有最上层：addKind 不给层就这么定
        const result = addKind(library, { name, color });
        return result.ok ? result.value.kindId : null;
      }}
      onRename={(kindId, name) => updateKind(library, kindId, { name })}
      onRecolor={(kindId, color) => updateKind(library, kindId, { color })}
      onRelayer={(kindId, layer) => updateKind(library, kindId, { layer })}
      onDelete={(kindId) => deleteKind(library, kindId)}
      countUsing={countUsing}
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
