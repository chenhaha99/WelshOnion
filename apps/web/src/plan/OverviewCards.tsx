import {
  countBlocksUsing,
  fillProgress,
  moneySummary,
  unscheduledMinutes,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { useRef, useState, type ReactNode } from "react";
import type * as Y from "yjs";
import { durationLabel } from "./block-time";
import { Donut, type DonutSlice } from "./Donut";
import { formatYuan } from "./money";
import { MoneyEditor } from "./MoneyEditor";
import { moneyOnHiddenBlocks } from "./money-cells";
import { moneyDetailOfKind, moneyItemsOfKind, timeDetailOfKind, timeItemsOfKind, type OverviewItem } from "./overview-items";
import {
  checkLine,
  moneyNoteLabel,
  moneyRowLabel,
  moneyShares,
  timeEmptyLabel,
  timeRowLabel,
  timeShares,
} from "./shares";

interface OverviewProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  filter?: StatsFilter;
  /** 点了展开里的一条：跳到那件事 */
  onJump: (blockId: string) => void;
  /** 点了「只看这一类」：按下筛选那一排的这个类型 */
  onOnlyKind: (kindId: string) => void;
}

/**
 * 「总览」视图：开销、时间两张卡片，各以一个环为主体（你提的：以这个饼为主体）。
 * 环中间写合计，外面一列说明；鼠标停上去看这一类几笔几件，点一下在卡片下面列出是哪几件。
 */
export function OverviewCards({ doc, library, libraryView, plan, filter, onJump, onOnlyKind }: OverviewProps) {
  return (
    // 宽了左右各一张，窄了上下堆（@container：按这一块自己的宽度算，不是整个窗口）
    <div className="@container">
      <div className="flex flex-col gap-4 @3xl:flex-row @3xl:items-start">
        <MoneyCard
          doc={doc}
          library={library}
          libraryView={libraryView}
          plan={plan}
          filter={filter}
          onJump={onJump}
          onOnlyKind={onOnlyKind}
        />
        <TimeCard libraryView={libraryView} plan={plan} filter={filter} onJump={onJump} onOnlyKind={onOnlyKind} />
      </div>
    </div>
  );
}

/** 开销：环中间是总额和人均；下面是没填的那句、「不属于任何一天」。 */
function MoneyCard({ doc, library, libraryView, plan, filter, onJump, onOnlyKind }: OverviewProps) {
  const [unattachedOpen, setUnattachedOpen] = useState(false);
  const unattachedButton = useRef<HTMLButtonElement>(null);
  const summary = moneySummary(plan, filter);
  const progress = fillProgress(plan, filter);
  const shares = moneyShares(plan, libraryView, filter);
  const hidden = moneyOnHiddenBlocks(plan, filter);

  const slices: DonutSlice[] = shares.rows
    .filter((row) => row.percent !== null && row.cents > 0)
    .map((row) => ({
      key: row.kindId,
      color: row.color,
      value: row.cents,
      label: `${row.name} ${formatYuan(row.cents)} · ${row.percent}%`,
      detail: moneyDetailOfKind(plan, row.kindId, filter),
    }));

  const note = [
    moneyNoteLabel(shares),
    progress.blocksWithoutMoney > 0 ? `另有 ${progress.blocksWithoutMoney} 件事还没填开销` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <OverviewCard
      label="开销总览"
      legendLabel="开销按类型"
      slices={slices}
      rows={shares.rows.map((row) => ({ key: row.kindId, color: row.color, label: moneyRowLabel(row), dim: row.percent === null }))}
      total={formatYuan(summary.totalCents)}
      subtitle={`人均 ${formatYuan(summary.perPersonCents)}`}
      emptyLabel={slices.length === 0 ? (moneyNoteLabel(shares) ?? "还没有填了金额的开销") : null}
      openedLabel={(name) => `${name}的开销`}
      itemsOfKind={(kindId) => moneyItemsOfKind(plan, kindId, filter)}
      onJump={onJump}
      onOnlyKind={onOnlyKind}
    >
      {note !== "" && (
        <p data-money-note className="text-sm text-ink-muted">
          {note}
        </p>
      )}
      {hidden > 0 && (
        <p data-hidden-money className="text-sm text-ink-muted">{`有 ${formatYuan(hidden)} 挂在被筛掉的事上`}</p>
      )}
      <div className="flex flex-col gap-2">
        <button
          ref={unattachedButton}
          type="button"
          aria-expanded={unattachedOpen}
          className="btn btn-ghost h-8 self-start px-2 text-sm tabular-nums"
          onClick={() => setUnattachedOpen((open) => !open)}
        >
          不属于任何一天：{formatYuan(summary.unattributedCents)}
        </button>
        {unattachedOpen && (
          <MoneyEditor
            doc={doc}
            library={library}
            plan={plan}
            kinds={[...libraryView.kinds.values()].sort((a, b) => a.order - b.order)}
            countKindUsing={(kindId) => countBlocksUsing(plan, { kindId })}
            block={null}
            label="不属于任何一天的开销"
            defaultKindId="other"
            // 收起后焦点回到「不属于任何一天」；先挪焦点，空行里填了没回车的借这次离开建上
            onDone={() => {
              unattachedButton.current?.focus();
              setUnattachedOpen(false);
            }}
          />
        )}
      </div>
    </OverviewCard>
  );
}

/** 时间：环中间是排了多久、还有多少没排；最下面是待定、划掉几件。 */
function TimeCard({
  libraryView,
  plan,
  filter,
  onJump,
  onOnlyKind,
}: Omit<OverviewProps, "doc" | "library">) {
  const [includeBaseLayer, setIncludeBaseLayer] = useState(false);
  const shares = timeShares(plan, libraryView, includeBaseLayer, filter);
  const total = shares.rows.reduce((sum, row) => sum + row.minutes, 0);
  const unscheduled = plan.bases.reduce((sum, base) => sum + unscheduledMinutes(plan, base.id, filter), 0);
  const marks = checkLine(plan, filter);

  return (
    <OverviewCard
      label="时间总览"
      legendLabel="时间按类型"
      slices={shares.rows.map((row) => ({
        key: row.kindId,
        color: row.color,
        value: row.minutes,
        label: timeRowLabel(row),
        detail: timeDetailOfKind(plan, row.kindId, filter),
      }))}
      rows={shares.rows.map((row) => ({ key: row.kindId, color: row.color, label: timeRowLabel(row), dim: false }))}
      total={durationLabel(total)}
      subtitle={unscheduled > 0 ? `还有 ${durationLabel(unscheduled)}没排` : null}
      emptyLabel={shares.rows.length === 0 ? timeEmptyLabel(shares) : null}
      openedLabel={(name) => `${name}的事`}
      itemsOfKind={(kindId) => timeItemsOfKind(plan, libraryView, kindId, filter)}
      onJump={onJump}
      onOnlyKind={onOnlyKind}
    >
      {shares.baseLayerMinutes > 0 && (
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="size-4 accent-sage"
            checked={includeBaseLayer}
            onChange={(event) => setIncludeBaseLayer(event.target.checked)}
          />
          {`算上最底层的类型（${shares.baseLayerNames.join("、")}）`}
        </label>
      )}
      {marks !== null && (
        <p data-check-line className="text-sm text-ink tabular-nums">
          {marks}
        </p>
      )}
    </OverviewCard>
  );
}

interface LegendRow {
  key: string;
  color: string;
  label: string;
  /** 不进比例的（全没填的那一类）：点是空心的，环上也没有它 */
  dim: boolean;
}

interface OverviewCardProps {
  label: string;
  /** 说明那一列的读屏名：「开销按类型」「时间按类型」（点开一类后，下面那块里也有一列，要分得开） */
  legendLabel: string;
  slices: DonutSlice[];
  rows: LegendRow[];
  total: string;
  subtitle: string | null;
  /** 环上一段都没有时写的那句 */
  emptyLabel: string | null;
  openedLabel: (kindName: string) => string;
  itemsOfKind: (kindId: string) => OverviewItem[];
  onJump: (blockId: string) => void;
  onOnlyKind: (kindId: string) => void;
  children?: ReactNode;
}

/** 两张卡片一个样子：环 + 说明（每一项是按钮）+ 点开的那一类 + 卡片各自的几行字。 */
function OverviewCard({
  label,
  legendLabel,
  slices,
  rows,
  total,
  subtitle,
  emptyLabel,
  openedLabel,
  itemsOfKind,
  onJump,
  onOnlyKind,
  children,
}: OverviewCardProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const openedRow = opened === null ? null : (rows.find((row) => row.key === opened) ?? null);
  // 点开的那一类被筛掉了、没了：自己收起
  if (opened !== null && openedRow === null) setOpened(null);
  const pick = (key: string) => setOpened((current) => (current === key ? null : key));

  return (
    <section
      aria-label={label}
      className="glass-card @container flex flex-1 flex-col gap-3 px-5 py-4"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || opened === null) return;
        event.stopPropagation();
        setOpened(null);
      }}
    >
      <div className="flex flex-col items-center gap-4 @md:flex-row @md:items-center">
        {slices.length > 0 ? (
          <Donut slices={slices} hovered={hovered} onHover={setHovered} onPick={pick}>
            <span data-donut-total className="text-xl font-medium text-ink tabular-nums">
              {total}
            </span>
            {subtitle !== null && (
              <span data-donut-note className="text-xs text-ink-muted tabular-nums">
                {subtitle}
              </span>
            )}
          </Donut>
        ) : (
          <p className="text-sm text-ink-muted">{emptyLabel}</p>
        )}
        <ul aria-label={legendLabel} className="flex flex-1 flex-col gap-1 self-stretch text-sm tabular-nums">
          {rows.map((row) => (
            <li key={row.key}>
              <button
                type="button"
                aria-expanded={opened === row.key}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-sage/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
                  row.dim ? "text-ink-muted" : "text-ink"
                } ${hovered === row.key ? "bg-sage/10" : ""}`}
                onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(row.key)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(row.key)}
                onBlur={() => setHovered(null)}
                onClick={() => pick(row.key)}
              >
                <span
                  aria-hidden
                  className="kind-dot"
                  style={row.dim ? { boxShadow: `inset 0 0 0 1.5px ${row.color}` } : { backgroundColor: row.color }}
                />
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {openedRow !== null && (
        <OpenedKind
          label={openedLabel(kindNameOf(openedRow.label))}
          items={itemsOfKind(openedRow.key)}
          onJump={onJump}
          onOnlyKind={() => onOnlyKind(openedRow.key)}
          onClose={() => setOpened(null)}
        />
      )}
      {children}
    </section>
  );
}

/** 说明那一行第一个词就是类型名（「住宿 ¥480 · 32%」）。 */
function kindNameOf(rowLabel: string): string {
  return rowLabel.split(" ")[0]!;
}

function OpenedKind({
  label,
  items,
  onJump,
  onOnlyKind,
  onClose,
}: {
  label: string;
  items: OverviewItem[];
  onJump: (blockId: string) => void;
  onOnlyKind: () => void;
  onClose: () => void;
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2 rounded-xl bg-white/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{label}</p>
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-ghost h-8 px-2 text-sm" onClick={onOnlyKind}>
            只看这一类
          </button>
          <button type="button" className="btn btn-ghost h-8 px-2 text-sm" onClick={onClose}>
            收起
          </button>
        </div>
      </div>
      <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto text-sm tabular-nums">
        {items.map((item) => (
          <li key={item.key}>
            {item.blockId === null ? (
              <span className="block px-2 py-1 text-ink-muted">{item.label}</span>
            ) : (
              <button
                type="button"
                className="block w-full rounded-lg px-2 py-1 text-left text-ink hover:bg-sage/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
                onClick={() => onJump(item.blockId!)}
              >
                {item.label}
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
