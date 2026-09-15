import {
  blockInterval,
  effectiveLayer,
  followersOf,
  kindLayer,
  type BlockView,
  type Interval,
  type LibraryView,
  type PlanView,
} from "@welshonion/core";

/** 存了层、却找不到叠在下面的那件时，「放在哪」显示的值 */
export const STACKED = "stacked";

export interface LayerChoices {
  /** 能叠上去的事，按开始时刻从早到晚 */
  targets: BlockView[];
  /** 现在叠在哪件上（块 id）；单独一道是 ""；存了层却找不到下面那件是 STACKED */
  current: string;
}

/**
 * 详情面板「放在哪」的选项。能叠上去的：排上时间、类型层和它一样、时间和它有重叠的事，不算它自己和跟着它走的块。
 * 现在叠在谁上：时间重叠、类型层一样、有效层正好比它低 1 的那件，有几件选时长最短的。
 * 它没排时间，或者没有能叠上去的、自己也没存层时是 null（不出这一栏）。
 */
export function layerChoices(plan: PlanView, library: LibraryView, block: BlockView): LayerChoices | null {
  const own = intervalOf(plan, block);
  if (own === null) return null;
  const followers = new Set(followersOf(plan, library, block.id));
  const layer = kindLayer(block, library);
  const targets = [...plan.blocks.values()]
    .flatMap((other) => {
      if (other.id === block.id || followers.has(other.id) || kindLayer(other, library) !== layer) return [];
      const span = intervalOf(plan, other);
      return span !== null && span.start < own.end && own.start < span.end ? [{ other, start: span.start }] : [];
    })
    .sort((a, b) => a.start - b.start)
    .map(({ other }) => other);
  if (block.layer === null) return targets.length === 0 ? null : { targets, current: "" };

  const below = effectiveLayer(block, library) - 1;
  const outer = targets
    .filter((other) => effectiveLayer(other, library) === below)
    .sort((a, b) => (a.duration_min ?? 0) - (b.duration_min ?? 0))[0];
  return { targets, current: outer?.id ?? STACKED };
}

function intervalOf(plan: PlanView, block: BlockView): Interval | null {
  const base = plan.bases.find((item) => item.id === block.start_base_id);
  return base ? blockInterval(block, base) : null;
}
