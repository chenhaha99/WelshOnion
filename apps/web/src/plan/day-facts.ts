import { dayFacts, unscheduledMinutes, type BaseView, type PlanView, type StatsFilter } from "@welshonion/core";
import { clockOnDay, durationLabel } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { formatYuan } from "./money";
import type { MoneyCell } from "./money-cells";

/**
 * 每天组头下面那一行「这天怎么样」的各项：几点起、几点收工、自驾多久多远、还有多少没排、这天花多少。
 * 没有的项不写，一项都没有是空数组。只摆数，不判断赶不赶。带筛选时被筛掉的块不算（钱格要用同一个筛选算）。
 */
export function dayFactsParts(
  plan: PlanView,
  base: BaseView,
  cells: ReadonlyMap<string, MoneyCell>,
  filter?: StatsFilter,
): string[] {
  const facts = dayFacts(plan, base.id, filter);
  const parts: string[] = [];

  if (facts.firstStartMinute !== null && facts.lastEndMinute !== null) {
    parts.push(`${clockOnDay(facts.firstStartMinute, base.date)} 起`, `${clockOnDay(facts.lastEndMinute, base.date)} 收工`);
  }

  const drive = [
    ...(facts.driveMinutes > 0 ? [durationLabel(facts.driveMinutes)] : []),
    ...(facts.driveDistanceM > 0 ? [distanceLabel(facts.driveDistanceM)] : []),
  ];
  if (drive.length > 0) parts.push(`自驾 ${drive.join(" ")}`);

  const unscheduled = unscheduledMinutes(plan, base.id, filter);
  if (unscheduled > 0) parts.push(`还有 ${durationLabel(unscheduled)}没排`);

  const money = dayMoney(plan, base.id, cells);
  if (money.count > money.unfilled) {
    const spent = `花 ${formatYuan(money.cents)}`;
    parts.push(money.unfilled > 0 ? `${spent}（还有 ${money.unfilled} 笔没填）` : spent);
  } else if (money.unfilled > 0) {
    parts.push(`有 ${money.unfilled} 笔钱没填`);
  }

  return parts;
}

/** 这天安排表里各块的钱格加起来：一笔钱只算在它的显示块（挂的块里表上最早那块）上，所以正好是整笔算进这天的钱。 */
function dayMoney(
  plan: PlanView,
  baseId: string,
  cells: ReadonlyMap<string, MoneyCell>,
): { cents: number; count: number; unfilled: number } {
  const total = { cents: 0, count: 0, unfilled: 0 };
  for (const block of blocksOfDay(plan, baseId)) {
    const cell = cells.get(block.id);
    if (!cell) continue;
    total.cents += cell.ownCents;
    total.count += cell.ownCount;
    total.unfilled += cell.unfilledCount;
  }
  return total;
}

/** 「800 米」「32 公里」「162.5 公里」：不到 1 公里写米，否则公里最多一位小数。 */
function distanceLabel(meters: number): string {
  if (meters < 1000) return `${meters} 米`;
  return `${Math.round(meters / 100) / 10} 公里`;
}
