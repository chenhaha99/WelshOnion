import { dayFacts, type BaseView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { Fragment } from "react";
import type * as Y from "yjs";
import { BlockTable } from "./BlockTable";
import { budgetParts } from "./day-budget";
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
  /** 按状态筛选；没开是 undefined */
  filter?: StatsFilter;
}

/** 列表视图里的一天：组头（标签、请假补班、这天的菜单）、展开的表单、这天怎么样、你设的预算，下面是这天的安排表。 */
export function DayRow({ doc, library, libraryView, plan, base, label, index, count, moneyCells, filter }: DayRowProps) {
  const dayMenu = useDayMenu({ doc, plan, base, label, index, count });
  const facts = dayFactsParts(plan, base, moneyCells, filter);
  const budget = dayFacts(plan, base.id).budget;
  const budgetLine = budget === null ? [] : budgetParts(budget);

  return (
    <li data-base-id={base.id} className="glass-card relative flex flex-col gap-2 px-5 py-3 has-[[aria-expanded=true]]:z-10">
      <div className="flex min-h-9 items-center gap-3">
        <span data-day-label className="text-ink tabular-nums">
          {label}
        </span>
        {base.day_flag && <span className="chip">{base.day_flag === "leave" ? "请假" : "补班"}</span>}
        <span className="flex-1" />
        {dayMenu.menu}
      </div>

      {dayMenu.form}

      {facts.length > 0 && (
        <p data-day-facts className="text-sm text-ink-muted tabular-nums">
          <Parts parts={facts} />
        </p>
      )}
      {budgetLine.length > 0 && (
        <p data-day-budget className="text-sm text-ink-muted tabular-nums">
          你设的：
          <Parts parts={budgetLine} />
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
        filter={filter}
        onEmptyFocus={dayMenu.focusMenu}
      />
    </li>
  );
}

/** 各项用「 · 」隔开；手机上放不下时只在项和项之间换行，一项不拆开。 */
function Parts({ parts }: { parts: string[] }) {
  return parts.map((part, index) => (
    <Fragment key={index}>
      {index > 0 && " · "}
      <span className="whitespace-nowrap">{part}</span>
    </Fragment>
  ));
}
