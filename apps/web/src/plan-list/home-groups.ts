import { baseStartUtcMs, kindLayer, type LibraryView, type PlanIndexEntryView, type PlanView } from "@welshonion/core";

/**
 * 首页按时间分组（照 Apple Invites、TripIt：即将开始的在前、已过去的另放）：
 * 进行中（今天在出发和结束之间，含两头）、即将出发（出发日期从近到远）、还没排日期、已结束（结束日期从近到远）。
 * 曾经是按最近打开排（12 月的东京能排在 10 月的杭州前面），2026-09-21 改掉。
 */
export interface PlanGroups<T> {
  ongoing: T[];
  upcoming: T[];
  undated: T[];
  past: T[];
}

type Dated = Pick<PlanIndexEntryView, "plan_id" | "date_start" | "date_end">;

export function groupPlans<T extends Dated>(plans: readonly T[], today: string): PlanGroups<T> {
  const groups: PlanGroups<T> = { ongoing: [], upcoming: [], undated: [], past: [] };
  for (const plan of plans) {
    if (plan.date_start === null || plan.date_end === null) groups.undated.push(plan);
    else if (plan.date_end < today) groups.past.push(plan);
    else if (plan.date_start > today) groups.upcoming.push(plan);
    else groups.ongoing.push(plan);
  }
  const by = (pick: (plan: T) => string, direction: 1 | -1) => (a: T, b: T) =>
    direction * compare(pick(a), pick(b)) || compare(a.plan_id, b.plan_id);
  groups.ongoing.sort(by((plan) => plan.date_start!, 1));
  groups.upcoming.sort(by((plan) => plan.date_start!, 1));
  groups.undated.sort(by((plan) => plan.plan_id, 1));
  groups.past.sort(by((plan) => plan.date_end!, -1));
  return groups;
}

/** 最上面那张「下一趟」：进行中的，没有就最近要出发的；都没有是 null。 */
export function nextPlan<T>(groups: PlanGroups<T>): T | null {
  return groups.ongoing[0] ?? groups.upcoming[0] ?? null;
}

/** 「下一趟」卡片上那一行：「还有 11 天出发」「明天出发」；进行中（卡片标签已经写了「正在进行」）写「第 2 天，共 3 天」。 */
export function countdownLine(plan: Dated & Pick<PlanIndexEntryView, "day_count">, today: string): string {
  const start = plan.date_start!;
  const days = daysBetween(today, start);
  if (days === 1) return "明天出发";
  if (days > 1) return `还有 ${days} 天出发`;
  return `第 ${-days + 1} 天，共 ${plan.day_count} 天`;
}

/**
 * 进行中那一趟今天接下来是什么：今天这一天里、开始不早于现在的第一件（停留、住宿这类底层的不算）。
 * 「下一件 14:00 灵隐寺」；今天没有了是 null。
 */
export function nextThingLine(plan: PlanView, library: LibraryView, nowIso: string): string | null {
  const now = Date.parse(nowIso);
  const base = plan.bases.find((candidate) => {
    const start = baseStartUtcMs(candidate.date, candidate.tz);
    return now >= start && now < start + 24 * 3600_000;
  });
  if (base === undefined) return null;
  const minuteNow = (now - baseStartUtcMs(base.date, base.tz)) / 60_000;
  const next = [...plan.blocks.values()]
    .filter(
      (block) =>
        block.start_base_id === base.id &&
        block.start_minute !== null &&
        block.start_minute >= minuteNow &&
        kindLayer(block, library) > 0,
    )
    .sort((a, b) => a.start_minute! - b.start_minute!)[0];
  if (next === undefined) return null;
  const clock = `${String(Math.floor(next.start_minute! / 60)).padStart(2, "0")}:${String(next.start_minute! % 60).padStart(2, "0")}`;
  return `下一件 ${clock} ${next.title}`;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function compare(x: string, y: string): number {
  return x < y ? -1 : x > y ? 1 : 0;
}
