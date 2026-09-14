import { shiftAllDays, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useMemo, useState } from "react";
import type * as Y from "yjs";
import { dayRowLabels, daysBetween } from "./day-labels";
import { DayRow } from "./DayRow";
import { moneyCells } from "./money-cells";
import { MoneyOverview } from "./MoneyOverview";
import { SharesCard } from "./SharesCard";
import { StatusFilter } from "./StatusFilter";
import { Timeline } from "./Timeline";

interface DayListProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
}

/**
 * 日期列表：按状态筛选、时间轴、钱的总览、占比，然后每天一个组头和它的安排表；出发日期一改，整趟一起平移。计划里至少有一天。
 * 按下了哪些状态只放在这里（不进计划文档、不进撤销），往下传给时间轴、钱、占比和每一天。
 */
export function DayList({ doc, library, libraryView, plan }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);
  const firstDate = bases[0]!.date;

  // 状态删掉了，按下过的就不算了
  const [selected, setSelected] = useState<string[]>([]);
  const statusKey = selected.filter((id) => libraryView.statuses.has(id)).join(",");
  const filter = useMemo<StatsFilter | undefined>(
    () => (statusKey === "" ? undefined : { statusIds: statusKey.split(",") }),
    [statusKey],
  );
  // 钱格的摘要整份算一次：共用的钱要看全计划才知道显示在哪块
  const cells = useMemo(() => moneyCells(plan, filter), [plan, filter]);

  return (
    <section className="flex flex-col gap-4">
      <label className="flex items-center gap-3 self-start text-sm text-ink-muted">
        出发日期
        <input
          type="date"
          className="input"
          value={firstDate}
          onChange={(event) => {
            const next = event.target.value;
            if (next !== "" && next !== firstDate) shiftAllDays(doc, daysBetween(firstDate, next));
          }}
        />
      </label>
      <StatusFilter libraryView={libraryView} selected={filter?.statusIds ?? []} onChange={setSelected} />
      <Timeline plan={plan} libraryView={libraryView} moneyCells={cells} filter={filter} />
      <MoneyOverview doc={doc} library={library} libraryView={libraryView} plan={plan} filter={filter} />
      <SharesCard libraryView={libraryView} plan={plan} filter={filter} />
      <ol aria-label="日期列表" className="flex flex-col gap-3">
        {bases.map((base, index) => (
          <DayRow
            key={base.id}
            doc={doc}
            library={library}
            libraryView={libraryView}
            plan={plan}
            base={base}
            label={labels[index]!}
            index={index}
            count={bases.length}
            moneyCells={cells}
            filter={filter}
          />
        ))}
      </ol>
    </section>
  );
}
