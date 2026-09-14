/**
 * 嵌套规则：拖拽、复制、删除共用。
 * 只在同一类型层里才有「谁套在谁里面」：类型层不同的块，谁压谁已经由类型决定。
 */
import { compareStrings } from "./order";
import type { BaseView, BlockView, LibraryView, PlanView } from "./read";
import { blockInterval, type Interval } from "./time";

/** 类型的层；类型在资料库里找不到时，按现存类型里最大的层算（和新建自定义类型默认放最上层一致）。 */
export function kindLayer(block: BlockView, library: LibraryView): number {
  if (!block.kind.deleted) return block.kind.layer;
  let top = 0;
  for (const kind of library.kinds.values()) {
    top = Math.max(top, kind.layer);
  }
  return top;
}

/** 块自己存的层优先，没有就用类型的层。 */
export function effectiveLayer(block: BlockView, library: LibraryView): number {
  return block.layer ?? kindLayer(block, library);
}

/**
 * outer 移动、复制、删除时会被带走的块：已排时间、起止都在 outer 的时间范围内、
 * 类型层和 outer 相同、有效层严格大于 outer。
 * 满足这几条的块，它自己会带走的块也一定满足，所以不用再递归。
 */
export function followersOf(plan: PlanView, library: LibraryView, outerId: string): string[] {
  const outer = plan.blocks.get(outerId);
  if (!outer) return [];
  const bases = new Map(plan.bases.map((base) => [base.id, base]));
  const outerInterval = intervalOf(outer, bases);
  if (!outerInterval) return [];
  const outerKindLayer = kindLayer(outer, library);
  const outerLayer = effectiveLayer(outer, library);

  const followers: string[] = [];
  for (const block of plan.blocks.values()) {
    if (block.id === outerId) continue;
    const interval = intervalOf(block, bases);
    if (!interval || interval.start < outerInterval.start || interval.end > outerInterval.end) continue;
    if (kindLayer(block, library) !== outerKindLayer) continue;
    if (effectiveLayer(block, library) <= outerLayer) continue;
    followers.push(block.id);
  }
  return followers.sort(compareStrings);
}

/**
 * 把 dragged 叠到 target 上时 dragged 的层：target 已排时间、类型层和 dragged 相同，才是 target 的有效层 + 1；
 * 否则返回 null，表示按「放旁边」处理。
 */
export function layerWhenOnto(
  plan: PlanView,
  library: LibraryView,
  dragged: BlockView,
  targetId: string,
): number | null {
  const target = plan.blocks.get(targetId);
  if (!target || target.start_minute === null) return null;
  if (kindLayer(target, library) !== kindLayer(dragged, library)) return null;
  return effectiveLayer(target, library) + 1;
}

function intervalOf(block: BlockView, bases: ReadonlyMap<string, BaseView>): Interval | null {
  const base = bases.get(block.start_base_id);
  return base ? blockInterval(block, base) : null;
}
