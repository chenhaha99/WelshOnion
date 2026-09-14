const MINUTES_PER_DAY = 1440;

const SLOT_NAMES = { morning: "上午", afternoon: "下午", evening: "晚上" } as const;

export type SlotName = keyof typeof SLOT_NAMES;

export interface BlockTimeFields {
  start_minute: number | null;
  duration_min: number | null;
  slot: SlotName | null;
}

/** 格子名；没分格就是整天。 */
export function slotLabel(slot: SlotName | null): string {
  return slot === null ? "整天" : SLOT_NAMES[slot];
}

/**
 * 时间格的字：没排时间写格子名；有时间写「开始–结束」，结束落在后面的日期时加上「月.日」，
 * 正好落在半夜 0 点写成当天的 24:00；时长为 0 只写开始时刻。
 */
export function blockTimeLabel(block: BlockTimeFields, baseDate: string): string {
  if (block.start_minute === null) return slotLabel(block.slot);
  const start = clock(block.start_minute);
  const duration = block.duration_min ?? 0;
  if (duration === 0) return start;

  const end = block.start_minute + duration;
  const dayOffset = Math.ceil(end / MINUTES_PER_DAY) - 1;
  const endClock = clock(end - dayOffset * MINUTES_PER_DAY);
  return dayOffset === 0 ? `${start}–${endClock}` : `${start}–${monthDay(addDays(baseDate, dayOffset))} ${endClock}`;
}

/** 分钟数写成「时:分」，1440 写成 24:00。 */
export function clock(minutes: number): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

function monthDay(date: string): string {
  return `${Number(date.slice(5, 7))}.${Number(date.slice(8, 10))}`;
}
