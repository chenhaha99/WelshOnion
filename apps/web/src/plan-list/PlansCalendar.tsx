import { useMemo, useState, type CSSProperties } from "react";
import { planHref } from "../app/route";
import { useNow, useTimeZone } from "../app/services";
import { todayIn } from "../plan/day-labels";
import { NextIcon, PreviousIcon } from "../plan/icons";
import { planSummaryLine } from "./format";
import { monthLayout, shiftMonth, type CalendarPlan } from "./plans-calendar";

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface PlansCalendarProps {
  plans: CalendarPlan[];
  /** 读屏名里的日期什么时候加年份，和卡片一样 */
  currentYear: number;
}

/**
 * 计划列表页的月历：每个排了日期的计划画成一条横条（跨周折成几段、同一周里重叠的分道，见 plans-calendar），
 * 点了打开那个计划；还没排日期的列在下面。打开是今天所在的月，能翻月，不在本月时有「本月」。
 * 日期重叠不提示：「不做任何主动提醒」是你提的。
 */
export function PlansCalendar({ plans, currentYear }: PlansCalendarProps) {
  const now = useNow();
  const timeZone = useTimeZone();
  const today = todayIn(now(), timeZone);
  const thisMonth = today.slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const layout = useMemo(() => monthLayout(month, plans), [month, plans]);

  return (
    <section aria-label="日历" className="glass-card flex flex-col gap-2 p-4 sm:p-5">
      {/* 左右两栏一样宽，「本月」出现、消失时标题不跟着挪 */}
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <button type="button" aria-label="上个月" title="上个月" className="btn btn-ghost justify-self-start px-2.5" onClick={() => setMonth(shiftMonth(month, -1))}>
          <PreviousIcon />
        </button>
        <h2 className="text-center text-lg font-medium text-ink tabular-nums">
          {`${Number(month.slice(0, 4))} 年 ${Number(month.slice(5, 7))} 月`}
        </h2>
        <div className="flex items-center justify-end gap-1">
          {month !== thisMonth && (
            <button type="button" className="btn btn-ghost px-3" onClick={() => setMonth(thisMonth)}>
              本月
            </button>
          )}
          <button type="button" aria-label="下个月" title="下个月" className="btn btn-ghost px-2.5" onClick={() => setMonth(shiftMonth(month, 1))}>
            <NextIcon />
          </button>
        </div>
      </header>

      <div aria-hidden className="grid grid-cols-7 text-center text-xs text-ink-muted">
        {WEEKDAYS.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div className="flex flex-col">
        {layout.weeks.map((week) => (
          <div
            key={week.days[0]!.date}
            data-week
            className="plans-calendar-week"
            style={{ gridTemplateRows: `1.5rem repeat(${week.laneCount}, 1.375rem)` } as CSSProperties}
          >
            {week.days.map((day, index) => (
              <span
                key={day.date}
                data-day={day.date}
                data-in-month={day.inMonth}
                aria-current={day.date === today ? "date" : undefined}
                className="plans-calendar-day"
                style={{ gridColumn: index + 1 }}
              >
                {Number(day.date.slice(8, 10))}
              </span>
            ))}
            {week.segments.map((segment) => (
              <a
                key={segment.plan.plan_id}
                href={planHref(segment.plan.plan_id)}
                aria-label={`${segment.plan.name} · ${planSummaryLine(segment.plan, currentYear)}`}
                title={`${segment.plan.name} · ${planSummaryLine(segment.plan, currentYear)}`}
                data-lane={segment.lane}
                data-continues-before={segment.continuesBefore || undefined}
                data-continues-after={segment.continuesAfter || undefined}
                className="plans-calendar-bar"
                style={{ gridColumn: `${segment.fromColumn} / ${segment.toColumn + 1}`, gridRow: segment.lane + 1 }}
              >
                {segment.plan.name}
              </a>
            ))}
          </div>
        ))}
      </div>

      {/* 画不上的也要看得见，不然切到日历它们就「不见了」 */}
      {layout.undated.length > 0 && (
        <p className="text-sm text-ink-muted">
          <span>还没排日期：</span>
          {layout.undated.map((plan, index) => (
            <span key={plan.plan_id}>
              {index > 0 && "、"}
              <a href={planHref(plan.plan_id)} className="text-ink underline-offset-2 hover:underline">
                {plan.name}
              </a>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}
