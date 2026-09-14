import { shiftAllDays, type LibraryView, type PlanView } from "@welshonion/core";
import type * as Y from "yjs";
import { dayRowLabels, daysBetween } from "./day-labels";
import { DayRow } from "./DayRow";

interface DayListProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
}

/** 日期列表：每天一个组头和它的安排表；出发日期一改，整趟一起平移。计划里至少有一天。 */
export function DayList({ doc, library, libraryView, plan }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);
  const firstDate = bases[0]!.date;

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
          />
        ))}
      </ol>
    </section>
  );
}
