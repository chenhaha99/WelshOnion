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

/** 加出来的事挂哪些标签：只按下一个标签时挂上它（加上就看得见），否则不挂。 */
export function addTagIdsFor(filter: StatsFilter | undefined): string[] {
  return filter?.tagIds?.length === 1 ? [filter.tagIds[0]!] : [];
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
  // 新加的事都没完成，「只看没完成的」挡不住它：只看类型和标签
  const filterKey = `${filter?.kindIds?.join(",") ?? ""}|${filter?.tagIds?.join(",") ?? ""}`;
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
  /** 建出来就挂着的标签 */
  tagIds: string[];
  onAdded: (blockId: string) => void;
  className?: string;
  /** 给了就直接排在这天这个钟点、这么长（手机时间线上）；不给是没排时间、在整天 */
  at?: { minute: number; duration: number };
}

/** 「加一件事」：填标题回车就建，没完成，类型和标签用给的；建完清空，焦点留着接着加。日程和时间线共用。 */
export function AddBlock({ doc, library, baseId, kindId, tagIds, onAdded, className = "input-bare", at }: AddBlockProps) {
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
            const when = at === undefined ? { slot: "day" as const } : { minute: at.minute, duration: at.duration };
            const added = addBlock(doc, library, { baseId, kindId, tagIds, title: text, ...when });
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
  /** 见 AddBlock 的 at */
  at?: { minute: number; duration: number };
  /** 建好以后（在「被筛掉了」那一句之外）外面还要做的，比如选中它 */
  onAdded?: (blockId: string) => void;
}

/** 时间线上一天的「加一件事」：时间线上没有「筛掉了 N 件」那一行，加的被筛掉了就在框下面写一句。 */
export function TimelineAddBlock({ doc, library, plan, baseId, filter, className, at, onAdded }: TimelineAddBlockProps) {
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
        tagIds={addTagIdsFor(filter)}
        onAdded={(blockId) => {
          justAdded.remember(blockId);
          onAdded?.(blockId);
        }}
        className={className}
        at={at}
      />
      {justAdded.hidden !== undefined && (
        <p className="px-1.5 text-[11px] leading-4 text-ink-muted">{`刚加的「${justAdded.hidden.title}」被筛掉了`}</p>
      )}
    </div>
  );
}
