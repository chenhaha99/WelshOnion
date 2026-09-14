import type { LibraryView, PlanView, StatsFilter } from "@welshonion/core";
import { useState } from "react";
import {
  moneyNoteLabel,
  moneyRowLabel,
  moneyShares,
  statusLine,
  timeEmptyLabel,
  timeRowLabel,
  timeShares,
} from "./shares";

interface SharesCardProps {
  libraryView: LibraryView;
  plan: PlanView;
  filter?: StatsFilter;
}

/** 条上的一段、说明里的一项；value 是 null 的（全没填的钱）不画在条上。 */
interface ShareItem {
  key: string;
  color: string;
  value: number | null;
  label: string;
}

/**
 * 钱的总览下面的「占比」：钱、时间各一条按类型分段的条和说明，再写各状态几件。
 * 只摆事实，不判断多不多；「算上最底层的类型」只影响这张卡片，不存进计划。
 */
export function SharesCard({ libraryView, plan, filter }: SharesCardProps) {
  const [includeBaseLayer, setIncludeBaseLayer] = useState(false);
  const money = moneyShares(plan, libraryView, filter);
  const moneyNote = moneyNoteLabel(money);
  const time = timeShares(plan, libraryView, includeBaseLayer, filter);

  return (
    <section aria-label="占比" className="glass-card flex flex-col gap-4 px-5 py-4">
      <div role="group" aria-label="钱的占比" className="flex flex-col gap-2">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <PartTitle>钱</PartTitle>
          {moneyNote !== null && <span className="text-sm text-ink-muted">{moneyNote}</span>}
        </p>
        {money.rows.some((row) => row.percent !== null) && (
          <Shares
            items={money.rows.map((row) => ({
              key: row.kindId,
              color: row.color,
              value: row.percent === null ? null : row.cents,
              label: moneyRowLabel(row),
            }))}
          />
        )}
      </div>

      <div role="group" aria-label="时间的占比" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="flex flex-wrap items-baseline gap-x-3">
            <PartTitle>时间</PartTitle>
            {time.rows.length === 0 && <span className="text-sm text-ink-muted">{timeEmptyLabel(time)}</span>}
          </p>
          {time.baseLayerMinutes > 0 && (
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                className="size-4 accent-sage"
                checked={includeBaseLayer}
                onChange={(event) => setIncludeBaseLayer(event.target.checked)}
              />
              {`算上最底层的类型（${time.baseLayerNames.join("、")}）`}
            </label>
          )}
        </div>
        {time.rows.length > 0 && (
          <Shares
            items={time.rows.map((row) => ({
              key: row.kindId,
              color: row.color,
              value: row.minutes,
              label: timeRowLabel(row),
            }))}
          />
        )}
      </div>

      <div role="group" aria-label="定没定">
        <p className="flex flex-wrap items-baseline gap-x-3">
          <PartTitle>定没定</PartTitle>
          <span className="text-sm text-ink tabular-nums">{statusLine(plan, libraryView, filter)}</span>
        </p>
      </div>
    </section>
  );
}

function PartTitle({ children }: { children: string }) {
  return <span className="text-sm font-medium text-ink">{children}</span>;
}

/** 按比例分段的条（读屏跳过，说明就是正文）和从多到少的说明；没进比例的项只在说明里，点是空心的。 */
function Shares({ items }: { items: ShareItem[] }) {
  return (
    <>
      <div aria-hidden="true" className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {items.map((item) =>
          item.value === null ? null : (
            <span
              key={item.key}
              data-share-segment
              style={{ flexGrow: item.value, flexBasis: 0, backgroundColor: item.color }}
            />
          ),
        )}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm tabular-nums">
        {items.map((item) => (
          <li
            key={item.key}
            className={`flex items-center gap-1.5 ${item.value === null ? "text-ink-muted" : "text-ink"}`}
          >
            <span
              aria-hidden="true"
              className="kind-dot"
              style={
                item.value === null
                  ? { boxShadow: `inset 0 0 0 1.5px ${item.color}` }
                  : { backgroundColor: item.color }
              }
            />
            {item.label}
          </li>
        ))}
      </ul>
    </>
  );
}
