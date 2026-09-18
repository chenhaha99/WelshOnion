import { addBlock, passesFilter, type PlanView, type StatsFilter } from "@welshonion/core";
import { useEffect, useState } from "react";
import type * as Y from "yjs";
import { AnchoredCard } from "../app/AnchoredCard";
import { addKindIdFor, addTagIdsFor } from "./AddBlock";
import { blockTimeLabel } from "./block-time";
import type { MinuteRange } from "./timeline-drag";

interface AddAtTimeProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  filter: StatsFilter | undefined;
  baseId: string;
  /** 这一行的标签：「第 1 天 · 10.1 周四」 */
  label: string;
  range: MinuteRange;
  /** 贴着谁弹：时间线上画出来的那个虚线框 */
  anchor: HTMLElement;
  onClose: () => void;
  /** 建出来、看得见了：外面关掉框、选中它 */
  onAdded: (blockId: string) => void;
}

/**
 * 在时间线空白处点一下、拖出一段以后弹出的「加一件事」：写着哪天几点，填标题回车就建一件排在这一段的事
 * （没划掉，类型和标签同「加一件事」跟着筛选）。Esc、点外面、「关闭」关掉，什么都不建。
 * 建出来被筛选挡住时不关，清空输入框接着能加，写一句「刚加的「标题」被筛掉了」。
 */
export function AddAtTime({ doc, library, plan, filter, baseId, label, range, anchor, onClose, onAdded }: AddAtTimeProps) {
  const [title, setTitle] = useState("");
  const [added, setAdded] = useState<{ blockId: string; title: string } | null>(null);
  const base = plan.bases.find((item) => item.id === baseId)!;
  const time = blockTimeLabel({ start_minute: range.from, duration_min: range.to - range.from, slot: null }, base.date);
  // 建完要等计划重读一遍才知道它看不看得见
  const addedBlock = added === null ? undefined : plan.blocks.get(added.blockId);
  const shown = addedBlock !== undefined && passesFilter(addedBlock, filter);
  useEffect(() => {
    if (shown && addedBlock !== undefined) onAdded(addedBlock.id);
    // 只在建出来的那件看得见时交出去一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, addedBlock?.id]);

  return (
    <AnchoredCard anchor={anchor} title="加一件事" estimatedHeight={150} onClose={onClose} phone="sheet">
      <p className="text-sm text-ink-muted tabular-nums">{`${label} · ${time}`}</p>
      <input
        aria-label="加一件事"
        placeholder="标题"
        className="input"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          const text = title.trim();
          if (text === "") return;
          const result = addBlock(doc, library, {
            baseId,
            kindId: addKindIdFor(filter),
            tagIds: addTagIdsFor(filter),
            title: text,
            minute: range.from,
            duration: range.to - range.from,
          });
          if (!result.ok) return;
          setTitle("");
          setAdded({ blockId: result.value.blockId, title: text });
        }}
      />
      {addedBlock !== undefined && !shown && (
        <p className="text-xs text-ink-muted">{`刚加的「${added!.title}」被筛掉了`}</p>
      )}
    </AnchoredCard>
  );
}
