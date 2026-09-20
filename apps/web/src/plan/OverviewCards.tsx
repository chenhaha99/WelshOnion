import {
  countBlocksUsing,
  fillProgress,
  moneySummary,
  type LibraryView,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { useRef, useState } from "react";
import type * as Y from "yjs";
import { durationLabel } from "./block-time";
import { KindRing, type RingKind } from "./KindRing";
import { formatYuan } from "./money";
import { MoneyEditor } from "./MoneyEditor";
import { moneyOnHiddenBlocks } from "./money-cells";
import { moneyItemsOfKind, timeItemsOfKind, type OverviewItem } from "./overview-items";
import { readOverviewRing, saveOverviewRing } from "./plan-overview-ring-memory";
import { checkLine, moneyNoteLabel, moneyShares, ringRows, timeShares, type RingRow, type Rings } from "./shares";

interface OverviewProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  /** 记「环拨在哪个维度」用：这个设置跟着每个计划走 */
  planId: string;
  filter?: StatsFilter;
  /** 点了展开里的一条：跳到那件事 */
  onJump: (blockId: string) => void;
  /** 点了「只看这一类」：按下筛选那一排的这个类型 */
  onOnlyKind: (kindId: string) => void;
}

/**
 * 「总览」视图：一张卡片、一个环，画开销还是画时间由圆心的开关定（你选的小样 2）。
 * 环下面每个类型一行，开销和时间两根条挨着——同一类的两个数在一行里比，不用在圆上来回找。
 * 停在一类上环和那一行一起亮、圆心换成这一类；点一下在下面列出是哪几笔、哪几件。
 */
export function OverviewCards({ doc, library, libraryView, plan, planId, filter, onJump, onOnlyKind }: OverviewProps) {
  const [includeBaseLayer, setIncludeBaseLayer] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [unattachedOpen, setUnattachedOpen] = useState(false);
  const [ringKind, setRingKind] = useState<RingKind>(() => readOverviewRing(planId));
  const unattachedButton = useRef<HTMLButtonElement>(null);
  const showRing = (kind: RingKind) => {
    setRingKind(kind);
    saveOverviewRing(planId, kind);
  };

  const rings = ringRows(plan, libraryView, includeBaseLayer, filter);
  const summary = moneySummary(plan, filter);
  const progress = fillProgress(plan, filter);
  const shares = moneyShares(plan, libraryView, filter);
  const time = timeShares(plan, libraryView, includeBaseLayer, filter);
  const hiddenCents = moneyOnHiddenBlocks(plan, filter);
  const marks = checkLine(plan, filter);

  const openedRow = opened === null ? null : (rings.rows.find((row) => (row.kindId || row.name) === opened) ?? null);
  // 点开的那一类被筛掉了、没了：自己收起
  if (opened !== null && openedRow === null) setOpened(null);
  const shownRow = hovered === null ? null : (rings.rows.find((row) => (row.kindId || row.name) === hovered) ?? null);

  const note = [
    shares.filledCount > 0 && shares.unfilledCount > 0
      ? `只算已填的 ${shares.filledCount} 笔，还有 ${shares.unfilledCount} 笔没填`
      : null,
    progress.blocksWithoutMoney > 0 ? `另有 ${progress.blocksWithoutMoney} 件事还没填开销` : null,
  ]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <section
      aria-label="总览"
      className="glass-card @container relative mx-auto flex w-full max-w-3xl flex-col gap-3 px-5 py-4"
      onKeyDown={(event) => {
        if (event.key !== "Escape" || opened === null) return;
        event.stopPropagation();
        setOpened(null);
      }}
    >
      <CornerBrackets />

      <div className="mx-auto w-full max-w-[24rem]">
        <KindRing
          rows={rings.rows}
          kind={ringKind}
          unscheduledMinutes={rings.unscheduledMinutes}
          empty={(ringKind === "money" ? rings.moneyEmpty : rings.timeEmpty) !== null}
          hovered={hovered}
          onHover={setHovered}
          onPick={(key) => setOpened((current) => (current === key ? null : key))}
        >
          {/* 开关钉在圆心上半部，位置固定：停在某一类上、下面的字换成明细时，它不能跟着没了——没了就点不着 */}
          <div role="group" aria-label="环上画开销还是时间" className="ring-switch" data-kind={ringKind}>
            <span aria-hidden className="ring-switch-thumb" />
            <button type="button" aria-pressed={ringKind === "money"} onClick={() => showRing("money")}>
              开销
            </button>
            <button type="button" aria-pressed={ringKind === "time"} onClick={() => showRing("time")}>
              时间
            </button>
          </div>
          <div className="ring-center-text">
            {shownRow === null ? (
              <RingTotals rings={rings} perPersonCents={summary.perPersonCents} kind={ringKind} />
            ) : (
              <>
                <span className="text-xs text-ink-muted">{shownRow.name}</span>
                {ringKind === "money" ? (
                  <span data-ring-big data-ring-money className="ring-center-big">
                    {shownRow.cents > 0 ? formatYuan(shownRow.cents) : "没有开销"}
                  </span>
                ) : (
                  <span data-ring-big data-ring-time className="ring-center-big">
                    {shownRow.minutes > 0 ? durationLabel(shownRow.minutes) : "没排时间"}
                  </span>
                )}
                <span data-ring-detail className="flex flex-col text-xs text-ink-muted tabular-nums">
                  {ringCenterDetail(shownRow, ringKind).map((line) => (
                    <span key={line}>{line}</span>
                  ))}
                </span>
              </>
            )}
          </div>
        </KindRing>
      </div>

      {/* 环下面每类一行：同一行里开销和时间两根条挨着，不用在圆上来回找 */}
      {rings.rows.length > 0 && (
        <div aria-hidden className="ring-heads">
          <span />
          <span data-on={ringKind === "money" ? "" : undefined}>开销</span>
          <span data-on={ringKind === "time" ? "" : undefined}>时间</span>
        </div>
      )}
      <ul aria-label="按类型" className="flex flex-col">
        {rings.rows.map((row) => {
          const key = row.kindId || row.name;
          return (
            <li key={key}>
              <button
                type="button"
                data-ring-row={key}
                aria-expanded={opened === key}
                aria-label={`${row.name} ${moneyAria(row)} · ${timeAria(row)}`}
                className={`ring-row ${hovered === key ? "is-on" : ""}`}
                onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(key)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(key)}
                onBlur={() => setHovered(null)}
                onClick={() => setOpened((current) => (current === key ? null : key))}
              >
                <span className="ring-row-name">
                  <span aria-hidden className="kind-dot" style={{ backgroundColor: row.color }} />
                  <span data-row-name>{row.name}</span>
                </span>
                <span aria-hidden className="ring-bar">
                  <span className="ring-bar-fill" style={{ width: `${row.moneyPercent ?? 0}%`, backgroundColor: row.color }} />
                  <span data-row-money className="ring-bar-val">
                    {moneyCell(row)}
                  </span>
                </span>
                <span aria-hidden className="ring-bar">
                  <span
                    className="ring-bar-fill is-time"
                    style={{ width: `${row.timePercent ?? 0}%`, backgroundColor: row.color }}
                  />
                  <span data-row-time className="ring-bar-val">
                    {timeCell(row)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {openedRow !== null && (
        <OpenedKind
          row={openedRow}
          moneyItems={openedRow.kindId === "" ? [] : moneyItemsOfKind(plan, openedRow.kindId, filter)}
          timeItems={openedRow.kindId === "" ? [] : timeItemsOfKind(plan, libraryView, openedRow.kindId, filter)}
          onJump={onJump}
          onOnlyKind={() => onOnlyKind(openedRow.kindId)}
          onClose={() => setOpened(null)}
        />
      )}

      {note !== "" && (
        <p data-money-note className="text-center text-sm text-ink-muted">
          {note}
        </p>
      )}
      {hiddenCents > 0 && (
        <p data-hidden-money className="text-center text-sm text-ink-muted">{`有 ${formatYuan(hiddenCents)} 挂在被筛掉的事上`}</p>
      )}
      {marks !== null && (
        <p data-check-line className="text-center text-sm text-ink tabular-nums">
          {marks}
        </p>
      )}
      {time.baseLayerMinutes > 0 && (
        <label className="flex items-center justify-center gap-2 text-sm text-ink-muted">
          <input
            type="checkbox"
            className="size-4 accent-sage"
            checked={includeBaseLayer}
            onChange={(event) => setIncludeBaseLayer(event.target.checked)}
          />
          {`算上最底层的类型（${time.baseLayerNames.join("、")}）`}
        </label>
      )}
      <div className="flex flex-col gap-2">
        <button
          ref={unattachedButton}
          type="button"
          aria-expanded={unattachedOpen}
          className="btn btn-ghost h-8 self-center px-2 text-sm tabular-nums"
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
    </section>
  );
}

/** 每类那一行开销那一格写的字；一笔都没填金额写「没填」（用词表：格子里、句子里都写「没填」）。 */
function moneyCell(row: RingRow): string {
  return row.moneyPercent === null ? "没填" : `${formatYuan(row.cents)} · ${row.moneyPercent}%`;
}

/** 每类那一行时间那一格写的字；一件排了时间的事都没有写「没排时间」。 */
function timeCell(row: RingRow): string {
  return row.minutes === 0 || row.timePercent === null ? "没排时间" : `${durationLabel(row.minutes)} · ${row.timePercent}%`;
}

/** 读屏念这一行时用的字：比看得见的那两格多写「占开销」「占时间」，光念数字听不出是什么。 */
const moneyAria = (row: RingRow) =>
  row.moneyPercent === null ? "开销没填" : `${formatYuan(row.cents)} · 占开销 ${row.moneyPercent}%`;
const timeAria = (row: RingRow) =>
  row.minutes === 0 || row.timePercent === null ? "没排时间" : `${durationLabel(row.minutes)} · 占时间 ${row.timePercent}%`;

/**
 * 圆心的合计：当前维度是大字，另一个维度缩成一行淡字。
 * 两个合计永远都看得到——「一共花多少钱」「一共多少小时」是总览最基本的两个数，不该要拨一下才看得见。
 */
function RingTotals({ rings, perPersonCents, kind }: { rings: Rings; perPersonCents: number; kind: RingKind }) {
  const moneyFigure = rings.moneyEmpty === null ? formatYuan(rings.moneyTotalCents) : "—";
  const moneyNote = rings.moneyEmpty ?? `人均 ${formatYuan(perPersonCents)}`;
  const timeFigure = rings.timeEmpty === null ? durationLabel(rings.minutesTotal) : "—";
  const timeNote =
    rings.timeEmpty ?? (rings.unscheduledMinutes > 0 ? `还有 ${durationLabel(rings.unscheduledMinutes)}没排` : null);
  const money = kind === "money";
  const note = money ? moneyNote : timeNote;
  const otherNote = money ? timeNote : moneyNote;

  return (
    <>
      {money ? (
        <span data-ring-big data-ring-money className="ring-center-big">
          {moneyFigure}
        </span>
      ) : (
        <span data-ring-big data-ring-time className="ring-center-big">
          {timeFigure}
        </span>
      )}
      {note !== null && <span className="text-xs text-ink-muted tabular-nums">{note}</span>}
      <span className="ring-center-other">
        {(money ? rings.timeEmpty : rings.moneyEmpty) !== null ? (
          // 另一个维度也空着：只写那句话。再写个「—·」在前面，看着像出错了
          <span>{otherNote}</span>
        ) : (
          <>
            {money ? <span data-ring-time>{timeFigure}</span> : <span data-ring-money>{moneyFigure}</span>}
            {otherNote !== null && (
              <>
                {" · "}
                <span>{otherNote}</span>
              </>
            )}
          </>
        )}
      </span>
    </>
  );
}

/** 停在一类上时，大字下面那两行：当前维度的占比，再一行淡字写另一个维度。分行写，一行太长会顶出圆心那个洞。 */
function ringCenterDetail(row: RingRow, kind: RingKind): string[] {
  const moneyShare = row.moneyPercent === null ? null : `占开销 ${row.moneyPercent}%`;
  const timeShare = row.timePercent === null ? null : `占时间 ${row.timePercent}%`;
  const timeFull =
    row.minutes > 0 && row.timePercent !== null ? `${durationLabel(row.minutes)} · 占时间 ${row.timePercent}%` : "没排时间";
  const moneyFull = row.moneyPercent === null ? "没有开销" : `${formatYuan(row.cents)} · 占开销 ${row.moneyPercent}%`;
  const lines = kind === "money" ? [moneyShare, timeFull] : [timeShare, moneyFull];
  return lines.filter((part): part is string => part !== null);
}

/** 卡片四角的切角：浅色底上的「未来感」之一（另外两样是环外的刻度和等宽数字） */
function CornerBrackets() {
  return (
    <>
      <span aria-hidden className="corner-bracket corner-tl" />
      <span aria-hidden className="corner-bracket corner-tr" />
      <span aria-hidden className="corner-bracket corner-bl" />
      <span aria-hidden className="corner-bracket corner-br" />
    </>
  );
}

function OpenedKind({
  row,
  moneyItems,
  timeItems,
  onJump,
  onOnlyKind,
  onClose,
}: {
  row: RingRow;
  moneyItems: OverviewItem[];
  timeItems: OverviewItem[];
  onJump: (blockId: string) => void;
  onOnlyKind: () => void;
  onClose: () => void;
}) {
  const merged = row.merged !== undefined;
  return (
    <section aria-label={`${row.name}的明细`} className="flex flex-col gap-2 rounded-xl bg-white/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-ink">{row.name}</p>
        <div className="flex items-center gap-1">
          {!merged && (
            <button type="button" className="btn btn-ghost h-8 px-2 text-sm" onClick={onOnlyKind}>
              只看这一类
            </button>
          )}
          <button type="button" className="btn btn-ghost h-8 px-2 text-sm" onClick={onClose}>
            收起
          </button>
        </div>
      </div>
      {merged ? (
        <p className="text-sm text-ink-muted">{`并起来的是：${row.merged!.join("、")}`}</p>
      ) : (
        <div className="flex flex-col gap-3 @xl:flex-row">
          <ItemList title="开销" items={moneyItems} onJump={onJump} empty="这一类没有开销" />
          <ItemList title="事" items={timeItems} onJump={onJump} empty="这一类没有排了时间的事" />
        </div>
      )}
    </section>
  );
}

function ItemList({
  title,
  items,
  onJump,
  empty,
}: {
  title: string;
  items: OverviewItem[];
  onJump: (blockId: string) => void;
  empty: string;
}) {
  return (
    <div className="flex-1">
      <p className="mb-1 text-xs text-ink-muted">{title}</p>
      {items.length === 0 ? (
        <p className="px-2 text-sm text-ink-muted">{empty}</p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-0.5 overflow-y-auto text-sm tabular-nums">
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
      )}
    </div>
  );
}
