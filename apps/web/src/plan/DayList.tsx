import { shiftAllDays, type KindView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { dayRowLabels, daysBetween } from "./day-labels";
import { DayRow } from "./DayRow";
import { FilterChips, chipClass } from "./FilterChips";
import { KindGroups } from "./KindGroups";
import { formatYuan } from "./money";
import { moneyCells, moneyOnHiddenBlocks } from "./money-cells";
import { MoneyOverview } from "./MoneyOverview";
import { SharesCard } from "./SharesCard";
import { Timeline } from "./Timeline";

const GROUPINGS = [
  { value: "day", label: "按天" },
  { value: "kind", label: "按类型" },
] as const;

interface DayListProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
}

/**
 * 日期列表：按状态、按类型筛选，时间轴、钱的总览、占比，然后每天一个组头和它的安排表；出发日期一改，整趟一起平移。计划里至少有一天。
 * 按下了哪些状态、类型只放在这里（不进计划文档、不进撤销），合成一个筛选条件往下传给时间轴、钱、占比和每一天。
 */
export function DayList({ doc, library, libraryView, plan }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);
  const firstDate = bases[0]!.date;

  // 状态、类型删掉了，按下过的就不算了
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  // 按天还是按类型分组，也只在这一页
  const [grouping, setGrouping] = useState<"day" | "kind">("day");
  const pressedGrouping = useRef<HTMLButtonElement>(null);
  const statusKey = selectedStatuses.filter((id) => libraryView.statuses.has(id)).join(",");
  const kindKey = selectedKinds.filter((id) => libraryView.kinds.has(id)).join(",");
  const filter = useMemo<StatsFilter | undefined>(() => {
    if (statusKey === "" && kindKey === "") return undefined;
    return {
      ...(statusKey === "" ? {} : { statusIds: statusKey.split(",") }),
      ...(kindKey === "" ? {} : { kindIds: kindKey.split(",") }),
    };
  }, [statusKey, kindKey]);
  // 钱格的摘要整份算一次：共用的钱要看全计划才知道显示在哪块
  const cells = useMemo(() => moneyCells(plan, filter), [plan, filter]);
  const hiddenCents = useMemo(() => moneyOnHiddenBlocks(plan, filter), [plan, filter]);
  const statuses = [...libraryView.statuses.values()].sort((a, b) => a.order - b.order);
  const kinds = usedKinds(plan, libraryView, filter?.kindIds ?? []);

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
      <FilterChips
        label="按状态筛选"
        lead="只看"
        clearLabel="全部显示"
        items={statuses}
        selected={filter?.statusIds ?? []}
        onChange={setSelectedStatuses}
      />
      {/* 只有一种类型时按下去什么都筛不掉，不出这一排；按下了就一直留着，不然取消不了 */}
      {(kinds.length >= 2 || (filter?.kindIds?.length ?? 0) > 0) && (
        <FilterChips
          label="按类型筛选"
          lead="类型"
          clearLabel="全部类型"
          items={kinds}
          selected={filter?.kindIds ?? []}
          onChange={setSelectedKinds}
        />
      )}
      <Timeline doc={doc} library={library} plan={plan} libraryView={libraryView} moneyCells={cells} filter={filter} />
      <MoneyOverview doc={doc} library={library} libraryView={libraryView} plan={plan} filter={filter} />
      <SharesCard libraryView={libraryView} plan={plan} filter={filter} />
      <div role="group" aria-label="分组" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-ink-muted">分组</span>
        {GROUPINGS.map(({ value, label }) => (
          <button
            key={value}
            ref={grouping === value ? pressedGrouping : undefined}
            type="button"
            aria-pressed={grouping === value}
            className={chipClass(grouping === value)}
            onClick={() => setGrouping(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {/* 按天、又按类型筛时，钱算进了总览、表里却找不到它挂的块：写出来，表和总览才对得上。按类型分组时钱都在组里 */}
      {grouping === "day" && hiddenCents > 0 && (
        <p data-hidden-money className="text-sm text-ink-muted">
          {`有 ${formatYuan(hiddenCents)} 挂在被筛掉的块上`}
        </p>
      )}
      {grouping === "day" ? (
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
      ) : (
        <KindGroups
          doc={doc}
          library={library}
          libraryView={libraryView}
          plan={plan}
          filter={filter}
          onEmptyFocus={() => pressedGrouping.current?.focus()}
        />
      )}
    </section>
  );
}

/** 「类型」那一排：这个计划的块和钱用到的类型，加上按下的（没人用了也留着），按类型的顺序。 */
function usedKinds(plan: PlanView, libraryView: LibraryView, pressed: readonly string[]): KindView[] {
  const ids = new Set<string>(pressed);
  for (const block of plan.blocks.values()) ids.add(block.kind.id);
  for (const expense of plan.expenses.values()) ids.add(expense.kind.id);
  return [...ids]
    .map((id) => libraryView.kinds.get(id))
    .filter((kind): kind is KindView => kind !== undefined)
    .sort((a, b) => a.order - b.order);
}
