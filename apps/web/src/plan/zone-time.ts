import { baseStartUtcMs, blockInterval, type BlockView, type PlanView } from "@welshonion/core";
import { addDays, clock, monthDay } from "./block-time";
import { cityName } from "./day-labels";
import { blockSegments } from "./timeline-layout";

const MINUTES_PER_DAY = 1440;
const MS_PER_MINUTE = 60_000;

/**
 * 跨时区的块写两地的时刻：「北京 18:00 → 洛杉矶 15:00」。结束落在哪一行和时间轴画横条一样，
 * 那一行和开始那一行时区不同才这样写，否则返回 null（照旧用 blockTimeLabel）。
 * 落地的当地日期不是出发那天时，落地前面加「月.日」；画到最后一行还没完，按最后一行的时区算。
 */
export function zoneTimeLabel(plan: PlanView, block: BlockView): string | null {
  if (block.start_minute === null || (block.duration_min ?? 0) === 0) return null;
  // 全程一个时区（大多数计划）不用往下算
  if (new Set(plan.bases.map((base) => base.tz)).size < 2) return null;
  const segments = blockSegments(plan, block);
  const last = segments[segments.length - 1];
  if (!last) return null;
  const startBase = plan.bases.find((base) => base.id === block.start_base_id)!;
  const endBase = plan.bases[last.row]!;
  if (endBase.tz === startBase.tz) return null;

  const { end } = blockInterval(block, startBase)!;
  const endMinute = (end - baseStartUtcMs(endBase.date, endBase.tz)) / MS_PER_MINUTE;
  // 正好落在半夜 0 点算前一天的 24:00，和 clockOnDay 一样
  const dayOffset = Math.max(0, Math.ceil(endMinute / MINUTES_PER_DAY) - 1);
  const endDate = addDays(endBase.date, dayOffset);
  const endClock = clock(endMinute - dayOffset * MINUTES_PER_DAY);
  const arrival = endDate === startBase.date ? endClock : `${monthDay(endDate)} ${endClock}`;
  return `${cityName(startBase.tz)} ${clock(block.start_minute)} → ${cityName(endBase.tz)} ${arrival}`;
}
