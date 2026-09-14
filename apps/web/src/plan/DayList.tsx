import { shiftAllDays, type BaseView } from "@welshonion/core";
import type * as Y from "yjs";
import { dayRowLabels, daysBetween } from "./day-labels";
import { DayRow } from "./DayRow";

/** 日期列表（以后表格「按天分组」的组头）；出发日期一改，整趟一起平移。bases 已排好序且不为空。 */
export function DayList({ doc, bases }: { doc: Y.Doc; bases: BaseView[] }) {
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
      <ol aria-label="日期列表" className="flex flex-col gap-2">
        {bases.map((base, index) => (
          <DayRow key={base.id} doc={doc} base={base} label={labels[index]!} index={index} count={bases.length} />
        ))}
      </ol>
    </section>
  );
}
