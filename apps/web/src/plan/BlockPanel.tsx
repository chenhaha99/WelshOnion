import { setBlockLayer, updateBlock, type BlockView, type LibraryView, type PlanView } from "@welshonion/core";
import { useRef } from "react";
import type * as Y from "yjs";
import { AnchoredCard } from "../app/AnchoredCard";
import { CommitInput } from "../app/CommitInput";
import { BlockDetails } from "./BlockDetails";
import { undatedArrangeItems } from "./block-actions";
import { layerChoices, STACKED } from "./block-layer-choices";

/** 左边一栏字、右边一栏控件 */
const FIELD_ROW = "grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2 text-sm";

interface BlockPanelProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  block: BlockView;
  /** 贴着谁弹出：点开它的那个按钮（快捷条的「详情…」、列表的行菜单） */
  anchor: HTMLElement;
  onClose: () => void;
}

/**
 * 一件事的详情：贴着打开它的按钮弹出的气泡（见 AnchoredCard），时间轴和列表打开的是同一个。
 * 里面只放快捷条上没有的几样：标题、放在哪（叠在谁上）、短备注 / 路程 / 长备注、没排时间的上移下移缩进。
 * 类型、状态、时间、开销、复制、删除都在快捷条上（列表里是表格的列），这里不重复摆。
 */
export function BlockPanel({ doc, library, libraryView, plan, block, anchor, onClose }: BlockPanelProps) {
  const arrangeGroup = useRef<HTMLDivElement>(null);
  const timed = block.start_minute !== null;
  const layers = layerChoices(plan, libraryView, block);

  // 上移、下移到了头，那个按钮不能点了，焦点会丢：挪到这一组里还能点的按钮上
  const keepArrangeFocus = () => {
    requestAnimationFrame(() => {
      const group = arrangeGroup.current;
      if (!group) return;
      const active = document.activeElement;
      if (active instanceof HTMLButtonElement && group.contains(active) && !active.disabled) return;
      group.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    });
  };

  return (
    <AnchoredCard
      anchor={anchor}
      title={block.title}
      estimatedHeight={280}
      onClose={onClose}
      initialFocus={(panel) => panel.querySelector<HTMLElement>("input")}
      // 手机上从底部浮起：里面只剩标题、备注这几样，占满一屏太空
      phone="sheet"
    >
      <CommitInput
        label="标题"
        value={block.title}
        commit={(text) => {
          // 清空不保存，恢复原标题
          if (text !== "" && text !== block.title) updateBlock(doc, library, block.id, { title: text });
          return null;
        }}
      />

      {timed && layers !== null && (
        <div className={FIELD_ROW}>
          <span className="text-ink-muted">放在哪</span>
          <select
            aria-label="放在哪"
            className="input min-w-0"
            value={layers.current}
            onChange={(event) => setBlockLayer(doc, library, block.id, event.target.value === "" ? null : event.target.value)}
          >
            <option value="">单独一道</option>
            {layers.current === STACKED && (
              <option value={STACKED} disabled>
                叠着
              </option>
            )}
            {layers.targets.map((target) => (
              <option key={target.id} value={target.id}>
                {`叠在「${target.title}」上`}
              </option>
            ))}
          </select>
        </div>
      )}

      <BlockDetails doc={doc} library={library} block={block} />

      {!timed && (
        <div ref={arrangeGroup} role="group" aria-label="排先后" className="flex flex-wrap gap-1.5">
          {undatedArrangeItems(doc, plan, block).map((item, index) => (
            // 按位置当 key：「缩进」换成「取消缩进」还是同一个按钮，焦点不丢
            <button
              key={index}
              type="button"
              className="btn btn-ghost h-8 px-3"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                keepArrangeFocus();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </AnchoredCard>
  );
}
