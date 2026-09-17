import { addBlock, passesFilter, type BlockView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useState } from "react";
import type * as Y from "yjs";
import { blocksOfDay } from "./day-blocks";

/** 新建的块默认「游玩」：第 ③ 步列的多是景点和活动，选错了在下拉里改。 */
const DEFAULT_KIND_ID = "sight";

/** 加出来的事是什么类型：只按下一个类型时就是这个类型（只看住宿时加「酒店」，加上就看得见），否则是游玩。 */
export function addKindIdFor(filter: StatsFilter | undefined): string {
  return filter?.kindIds?.length === 1 ? filter.kindIds[0]! : DEFAULT_KIND_ID;
}

/**
 * 这天最近加的那件被筛掉了没有：被筛掉了 hidden 是它，好在界面上写一句；筛选变了、它显示出来了、它没了，就不再算。
 * dayBlocks 是这天全部的事，shown 是其中通过筛选的（同一批对象）。
 */
export function useJustAdded(
  dayBlocks: readonly BlockView[],
  shown: readonly BlockView[],
  filter: StatsFilter | undefined,
): { hidden: BlockView | undefined; remember: (blockId: string) => void } {
  // 新加的事都没划掉，「只看没划掉的」挡不住它：只看类型
  const filterKey = filter?.kindIds?.join(",") ?? "";
  const [justAdded, setJustAdded] = useState<{ blockId: string; filterKey: string } | null>(null);
  const added = justAdded === null ? undefined : dayBlocks.find((block) => block.id === justAdded.blockId);
  const hidden = justAdded?.filterKey === filterKey && added !== undefined && !shown.includes(added) ? added : undefined;
  if (justAdded !== null && hidden === undefined) setJustAdded(null);
  return { hidden, remember: (blockId) => setJustAdded({ blockId, filterKey }) };
}

interface AddBlockProps {
  doc: Y.Doc;
  library: Y.Doc;
  baseId: string;
  /** 建出来的类型 */
  kindId: string;
  onAdded: (blockId: string) => void;
  className?: string;
}

/** 「加一件事」：填标题回车就建，没排时间、在整天、没划掉，类型用给的；建完清空，焦点留着接着加。列表和时间轴共用。 */
export function AddBlock({ doc, library, baseId, kindId, onAdded, className = "input-bare" }: AddBlockProps) {
  const [title, setTitle] = useState("");
  return (
    <input
      aria-label="加一件事"
      placeholder="加一件事"
      className={className}
      value={title}
      onChange={(event) => setTitle(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const text = title.trim();
          if (text !== "") {
            const added = addBlock(doc, library, { baseId, kindId, title: text, slot: "day" });
            if (added.ok) onAdded(added.value.blockId);
          }
          setTitle("");
        } else if (event.key === "Escape") {
          setTitle("");
        }
      }}
    />
  );
}

interface TimelineAddBlockProps {
  doc: Y.Doc;
  library: Y.Doc;
  plan: PlanView;
  baseId: string;
  filter: StatsFilter | undefined;
  className: string;
}

/** 时间轴上一天的「加一件事」：时间轴上没有「筛掉了 N 件」那一行，加的被筛掉了就在框下面写一句。 */
export function TimelineAddBlock({ doc, library, plan, baseId, filter, className }: TimelineAddBlockProps) {
  const dayBlocks = blocksOfDay(plan, baseId);
  const shown = dayBlocks.filter((block) => passesFilter(block, filter));
  const justAdded = useJustAdded(dayBlocks, shown, filter);
  return (
    <div className="flex min-w-0 flex-col">
      <AddBlock
        doc={doc}
        library={library}
        baseId={baseId}
        kindId={addKindIdFor(filter)}
        onAdded={justAdded.remember}
        className={className}
      />
      {justAdded.hidden !== undefined && (
        <p className="px-1.5 text-[11px] leading-4 text-ink-muted">{`刚加的「${justAdded.hidden.title}」被筛掉了`}</p>
      )}
    </div>
  );
}
