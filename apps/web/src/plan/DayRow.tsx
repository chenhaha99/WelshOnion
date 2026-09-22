import { dayFacts, type BaseView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { Fragment } from "react";
import type * as Y from "yjs";
import { BlockTable } from "./BlockTable";
import { dayFactsParts } from "./day-facts";
import { useDayMenu } from "./day-menu";
import type { MoneyCell } from "./money-cells";

interface DayRowProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  base: BaseView;
  label: string;
  index: number;
  count: number;
  moneyCells: ReadonlyMap<string, MoneyCell>;
  /** 全计划每件事会带走几件 */
  followerCounts: ReadonlyMap<string, number>;
  /** 计划里的每一天和它的标签，「复制到…」列出来选 */
  dayChoices: ReadonlyArray<{ baseId: string; label: string }>;
  /** 筛选；没开是 undefined */
  filter?: StatsFilter;
}

/**
 * 日程视图里的一天：组头（标签、这天的菜单）、展开的表单、这天怎么样，下面是这天的时刻表。
 * 电脑上（这天宽 40rem 起）组头在左边一列，其余在右边；窄的时候组头在上面（见 index.css 的 day-layout）。
 */
export function DayRow({
  doc,
  library,
  libraryView,
  plan,
  base,
  label,
  index,
  count,
  moneyCells,
  followerCounts,
  dayChoices,
  filter,
}: DayRowProps) {
  const dayMenu = useDayMenu({ doc, library, libraryView, plan, base, label, index, count, filter });
  const facts = dayFactsParts(plan, base, moneyCells, filter);
  // 「第 1 天 · 10.1 周四」拆成两截：电脑上「第 1 天」大字一行、日期（和城市）小字一行
  const split = label.indexOf(" · ");
  const [number, date] = split === -1 ? [label, ""] : [label.slice(0, split), label.slice(split + 3)];

  return (
    <li
      data-base-id={base.id}
      className="schedule-day glass-card @container relative px-5 py-3 has-[[aria-expanded=true]]:z-10"
    >
      <div className="day-layout">
        <div data-day-side className="day-side">
          <span data-day-label className="text-ink tabular-nums">
            <span className="day-number">{number}</span>
            {date !== "" && (
              <>
                <span className="day-sep"> · </span>
                <span className="day-date">{date}</span>
              </>
            )}
          </span>
          {dayMenu.menu}
        </div>

        <div data-day-main className="flex min-w-0 flex-col gap-2">
          {dayMenu.form}

          {facts.length > 0 && (
            <p data-day-facts className="text-sm text-ink-muted tabular-nums">
              <Parts parts={facts} />
            </p>
          )}

          <BlockTable
            doc={doc}
            library={library}
            libraryView={libraryView}
            plan={plan}
            baseId={base.id}
            date={base.date}
            dayLabel={label}
            moneyCells={moneyCells}
            followerCounts={followerCounts}
            dayChoices={dayChoices}
            filter={filter}
            onEmptyFocus={dayMenu.focusMenu}
          />
        </div>
      </div>
    </li>
  );
}

/** 各项用「 · 」隔开；手机上放不下时只在项和项之间换行，一项不拆开。 */
export function Parts({ parts }: { parts: string[] }) {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && " · "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}
