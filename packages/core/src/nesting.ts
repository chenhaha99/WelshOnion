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

/** 判断「会不会被带走」要用的：绝对起止、类型的层、有效层 */
interface Placed {
  id: string;
  interval: Interval;
  kindLayer: number;
  layer: number;
}

function placed(block: BlockView, bases: ReadonlyMap<string, BaseView>, library: LibraryView): Placed | null {
  const interval = intervalOf(block, bases);
  if (!interval) return null;
  return { id: block.id, interval, kindLayer: kindLayer(block, library), layer: effectiveLayer(block, library) };
}

/** block 会不会被 outer 带走：起止都在 outer 的时间范围内、类型层和 outer 相同、有效层严格大于 outer。 */
function follows(block: Placed, outer: Placed): boolean {
  return (
    block.id !== outer.id &&
    block.interval.start >= outer.interval.start &&
    block.interval.end <= outer.interval.end &&
    block.kindLayer === outer.kindLayer &&
    block.layer > outer.layer
  );
}

/**
 * outer 移动、复制、删除时会被带走的块：已排时间、起止都在 outer 的时间范围内、
 * 类型层和 outer 相同、有效层严格大于 outer。
 * 满足这几条的块，它自己会带走的块也一定满足，所以不用再递归。
 */
export function followersOf(plan: PlanView, library: LibraryView, outerId: string): string[] {
  const outerBlock = plan.blocks.get(outerId);
  if (!outerBlock) return [];
  const bases = basesById(plan);
  const outer = placed(outerBlock, bases, library);
  if (!outer) return [];
  const followers: string[] = [];
  for (const block of plan.blocks.values()) {
    const candidate = placed(block, bases, library);
    if (candidate && follows(candidate, outer)) followers.push(block.id);
  }
  return followers.sort(compareStrings);
}

/**
 * 全计划每件排了时间的事会带走几件（没排时间的不在里面），一次算好：每件事的时间只换算一次。
 * 日程每一行的「删除（连同里面的 N 件）」用；一行行各调 followersOf，大计划一次要换算几万次。
 */
export function followerCounts(plan: PlanView, library: LibraryView): Map<string, number> {
  const bases = basesById(plan);
  const all = [...plan.blocks.values()].flatMap((block) => placed(block, bases, library) ?? []);
  return new Map(all.map((outer) => [outer.id, all.filter((block) => follows(block, outer)).length]));
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

function basesById(plan: PlanView): Map<string, BaseView> {
  return new Map(plan.bases.map((base) => [base.id, base]));
}

function intervalOf(block: BlockView, bases: ReadonlyMap<string, BaseView>): Interval | null {
  const base = bases.get(block.start_base_id);
  return base ? blockInterval(block, base) : null;
}
