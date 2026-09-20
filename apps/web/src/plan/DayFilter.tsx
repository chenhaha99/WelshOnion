import { Popover } from "../app/Popover";
import { chipClass } from "./FilterChips";

/** 一天：底座 id、是第几天、那一行的标签「第 1 天 · 10.1 周四」。 */
export interface FilterDay {
  id: string;
  number: number;
  label: string;
}

interface DayFilterProps {
  days: readonly FilterDay[];
  /** 按下了哪几天；空的就是全看 */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/**
 * 按钮上写选了哪几天：一天都没选写「天」；连着的几天写「第 1–3 天」；不连着写「3 天」。
 * 天数可以十几个，一行摆不下，所以按钮上只写个数，点开才一天一行。
 */
export function dayFilterLabel(days: readonly FilterDay[], selected: readonly string[]): string {
  const picked = days.filter((day) => selected.includes(day.id));
  if (picked.length === 0) return "天";
  const first = picked[0]!.number;
  const last = picked[picked.length - 1]!.number;
  const numbers = new Set(picked.map((day) => day.number));
  if (numbers.size === last - first + 1) return first === last ? `第 ${first} 天` : `第 ${first}–${last} 天`;
  return `${numbers.size} 天`;
}

/**
 * 筛选那一排最后的「天」：点开一天一行，多选；选了几天就只看这几天的事（跨天的按开始那天算）。
 * 你提的（原话「我可以用这个筛选来做到只看其中某3天的分布」）。
 */
export function DayFilter({ days, selected, onChange }: DayFilterProps) {
  const label = dayFilterLabel(days, selected);
  return (
    <Popover
      label={`按天筛选：${label}`}
      triggerTitle="只看某几天"
      trigger={label}
      triggerClassName={chipClass(selected.length > 0)}
      role="dialog"
      panelLabel="按天筛选"
      panelClassName="menu max-h-80 w-56"
      align="start"
      estimatedHeight={280}
    >
      {(close) => (
        <div className="flex flex-col">
          {days.map((day) => {
            const pressed = selected.includes(day.id);
            return (
              <button
                key={day.id}
                type="button"
                aria-pressed={pressed}
                className="menu-item flex items-center gap-2"
                onClick={() => onChange(pressed ? selected.filter((id) => id !== day.id) : [...selected, day.id])}
              >
                <span aria-hidden className={`kind-dot ${pressed ? "bg-sage" : "bg-ink/15"}`} />
                {day.label}
              </button>
            );
          })}
          {/* 一天一天是挑着按的，按完面板留着；「全部天」是「不筛了」，按完就收，正好看结果 */}
          {selected.length > 0 && (
            <button
              type="button"
              className="menu-item text-ink-muted"
              onClick={() => {
                onChange([]);
                close(true);
              }}
            >
              全部天
            </button>
          )}
        </div>
      )}
    </Popover>
  );
}
