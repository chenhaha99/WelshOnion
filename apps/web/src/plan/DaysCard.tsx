import type { PlanView, StatsFilter } from "@welshonion/core";
import type { ReactNode } from "react";
import { useNow, useTimeZone } from "../app/services";
import { useWideScreen } from "../app/use-wide-screen";
import { todayIn } from "./day-labels";
import { Parts } from "./DayRow";
import type { MoneyCell } from "./money-cells";
import { overviewDays, type OverviewRow } from "./overview-days";

interface DaysCardProps {
  plan: PlanView;
  /** 每天的标签「第 1 天 · 10.1 周四」，和列表组头一样 */
  labels: readonly string[];
  cells: ReadonlyMap<string, MoneyCell>;
  filter?: StatsFilter;
  /** 点了一天的日期：切到时间轴上的那天 */
  onJump: (baseId: string) => void;
}

interface Column {
  name: string;
  has: (row: OverviewRow) => boolean;
  render: (row: OverviewRow) => ReactNode;
}

/** 日期后面的几列。一列在所有行里都空着（比如整趟没有自驾）就不出现。 */
const COLUMNS: readonly Column[] = [
  { name: "起–收工", has: (row) => row.span !== null, render: (row) => row.span },
  { name: "排了", has: (row) => row.busy !== null, render: (row) => row.busy },
  { name: "自驾", has: (row) => row.drive !== null, render: (row) => row.drive },
  { name: "还没排", has: (row) => row.unscheduled !== null, render: (row) => row.unscheduled },
  {
    name: "花",
    has: (row) => row.money !== null || row.unfilled !== null,
    render: (row) => (
      <>
        {row.money !== null && <span className="block">{row.money}</span>}
        {row.unfilled !== null && <span className="block text-xs text-ink-muted">{row.unfilled}</span>}
        {row.share !== null && <MoneyBar share={row.share} />}
      </>
    ),
  },
  { name: "几件", has: (row) => row.blocks !== null, render: (row) => row.blocks },
];

/**
 * 总览里的「每天」：一天一行并排比几点起收工、排了多久、自驾、还没排、花多少、几件，最后是不属于任何一天和合计。
 * 电脑上是一张表，手机上一天两行字。只摆数：不按多少变色、不排名、不判断赶不赶。
 */
export function DaysCard({ plan, labels, cells, filter, onJump }: DaysCardProps) {
  const wide = useWideScreen();
  const now = useNow();
  const timeZone = useTimeZone();
  const { days, extra, total } = overviewDays(plan, cells, labels, todayIn(now(), timeZone), filter);
  const rows = [...days, ...extra, total];
  const columns = COLUMNS.filter((column) => rows.some(column.has));

  let body: ReactNode;
  if (columns.length === 0) {
    body = <p className="text-sm text-ink-muted">还没有事，也没有开销</p>;
  } else if (wide) {
    body = (
      <table aria-label="每天" className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-xs text-ink-muted">
            <th scope="col" className="py-1.5 pr-3 text-left font-normal">
              日期
            </th>
            {columns.map((column) => (
              <th key={column.name} scope="col" className="px-3 py-1.5 text-right font-normal last:pr-0">
                {column.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {days.map((row) => (
            <TableRow key={row.baseId} row={row} columns={columns} onJump={onJump} />
          ))}
        </tbody>
        <tfoot>
          {[...extra, total].map((row) => (
            <TableRow key={row.label} row={row} columns={columns} onJump={onJump} />
          ))}
        </tfoot>
      </table>
    );
  } else {
    body = (
      <ul aria-label="每天" className="flex flex-col">
        {rows.map((row) => (
          <li key={row.baseId ?? row.label} className="flex flex-col gap-1 border-t border-ink/5 py-2 first:border-t-0">
            <div className="flex items-baseline justify-between gap-3">
              <DayName row={row} onJump={onJump} />
              {row.money !== null && (
                <span data-day-money className="text-sm text-ink tabular-nums">
                  {row.money}
                </span>
              )}
            </div>
            {row.line.length > 0 && (
              <p data-day-line className="text-sm text-ink-muted tabular-nums">
                <Parts parts={row.line} />
              </p>
            )}
            {row.share !== null && <MoneyBar share={row.share} />}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section aria-label="每天" className="glass-card flex flex-col gap-2 px-5 py-4">
      <span className="text-sm font-medium text-ink">每天</span>
      {body}
    </section>
  );
}

function TableRow({
  row,
  columns,
  onJump,
}: {
  row: OverviewRow;
  columns: readonly Column[];
  onJump: (baseId: string) => void;
}) {
  return (
    <tr className={`border-t border-ink/5 ${row.label === "合计" ? "text-ink" : "text-ink/90"}`}>
      <th scope="row" className="py-2 pr-3 text-left align-top font-normal">
        <DayName row={row} onJump={onJump} />
      </th>
      {columns.map((column) => (
        <td
          key={column.name}
          className={`px-3 py-2 text-right align-top last:pr-0 ${column.name === "花" ? "w-36" : ""}`}
        >
          {column.render(row)}
        </td>
      ))}
    </tr>
  );
}

/** 某一天是按钮（点了到时间轴上的那天），今天后面写「今天」；最后几行只是字。 */
function DayName({ row, onJump }: { row: OverviewRow; onJump: (baseId: string) => void }) {
  const { baseId } = row;
  if (baseId === null) return <span className="text-sm text-ink">{row.label}</span>;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <button
        type="button"
        aria-label={`在时间轴上看 ${row.label}`}
        className="rounded text-left text-sm text-ink underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
        onClick={() => onJump(baseId)}
      >
        {row.label}
      </button>
      {row.isToday && <span className="text-xs text-sage">今天</span>}
    </span>
  );
}

/** 这天花的钱和花得最多那天比的细条：一种中性色，读屏跳过（钱数就在旁边）。 */
function MoneyBar({ share }: { share: number }) {
  return (
    <span aria-hidden="true" data-money-bar className="mt-1 block h-1 overflow-hidden rounded-full bg-ink/5">
      <span className="block h-full rounded-full bg-ink/25" style={{ width: `${share * 100}%` }} />
    </span>
  );
}
