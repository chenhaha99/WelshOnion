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
import { DualRing, ringLabelPlaces } from "./DualRing";
import { formatYuan } from "./money";
import { MoneyEditor } from "./MoneyEditor";
import { moneyOnHiddenBlocks } from "./money-cells";
import { moneyItemsOfKind, timeItemsOfKind, type OverviewItem } from "./overview-items";
import { checkLine, moneyNoteLabel, moneyShares, ringRows, timeShares, type RingRow } from "./shares";

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
 * 「总览」视图：一张卡片、一个同心双环（你选的小样 B）——外圈是开销、内圈是时间，同一个类型两圈同色。
 * 中间写合计，鼠标停在一类上两圈一起亮、中间换成这一类的开销和时间；点一下在下面列出是哪几笔、哪几件。
 */
export function OverviewCards({ doc, library, libraryView, plan, filter, onJump, onOnlyKind }: OverviewProps) {
  const [includeBaseLayer, setIncludeBaseLayer] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [opened, setOpened] = useState<string | null>(null);
  const [unattachedOpen, setUnattachedOpen] = useState(false);
  const unattachedButton = useRef<HTMLButtonElement>(null);

  const rings = ringRows(plan, libraryView, includeBaseLayer, filter);
  const summary = moneySummary(plan, filter);
  const progress = fillProgress(plan, filter);
  const shares = moneyShares(plan, libraryView, filter);
  const time = timeShares(plan, libraryView, includeBaseLayer, filter);
  const hiddenCents = moneyOnHiddenBlocks(plan, filter);
  const marks = checkLine(plan, filter);
  const places = ringLabelPlaces(rings.rows, rings.unscheduledMinutes);

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
      {/* 哪圈是什么：不说一次没人知道外圈是开销 */}
      <p className="flex justify-center gap-4 text-xs text-ink-muted">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="ring-key ring-key-outer" />
          外圈 · 开销
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="ring-key ring-key-inner" />
          内圈 · 时间
        </span>
      </p>

      {/* 上下留出一圈：标签贴在环外面，会超出这个方块，不留就压到下面的明细上 */}
      <div className="relative mx-auto my-6 w-full max-w-[26rem]">
        <DualRing
          rows={rings.rows}
          unscheduledMinutes={rings.unscheduledMinutes}
          moneyEmpty={rings.moneyEmpty !== null}
          timeEmpty={rings.timeEmpty !== null}
          hovered={hovered}
          onHover={setHovered}
          onPick={(key) => setOpened((current) => (current === key ? null : key))}
        >
          {shownRow === null ? (
            <>
              <span data-ring-money className="text-2xl font-medium text-ink tabular-nums">
                {rings.moneyEmpty === null ? formatYuan(rings.moneyTotalCents) : "—"}
              </span>
              <span className="text-xs text-ink-muted tabular-nums">
                {rings.moneyEmpty ?? `人均 ${formatYuan(summary.perPersonCents)}`}
              </span>
              <span data-ring-time className="mt-2 text-base font-medium text-ink tabular-nums">
                {rings.timeEmpty === null ? durationLabel(rings.minutesTotal) : "—"}
              </span>
              {(rings.timeEmpty !== null || rings.unscheduledMinutes > 0) && (
                <span className="text-xs text-ink-muted tabular-nums">
                  {rings.timeEmpty ?? `还有 ${durationLabel(rings.unscheduledMinutes)}没排`}
                </span>
              )}
            </>
          ) : (
            <>
              <span className="text-xs text-ink-muted">{shownRow.name}</span>
              <span data-ring-money className="text-2xl font-medium text-ink tabular-nums">
                {shownRow.cents > 0 ? formatYuan(shownRow.cents) : "没有开销"}
              </span>
              <span data-ring-detail className="flex flex-col text-xs text-ink-muted tabular-nums">
                {ringCenterDetail(shownRow).map((line) => (
                  <span key={line}>{line}</span>
                ))}
              </span>
            </>
          )}
        </DualRing>
        {/* 贴在环外的一圈标签：每一类一个按钮，键盘和读屏走这里 */}
        <ul aria-label="按类型">
          {places.map(({ key, row, left, top }) => (
            <li key={key}>
              <button
                type="button"
                data-ring-label={key}
                aria-expanded={opened === key}
                className={`ring-label ${hovered === key ? "is-on" : ""}`}
                style={{ left: `${left}%`, top: `${top}%` }}
                onPointerEnter={(event) => event.pointerType === "mouse" && setHovered(key)}
                onPointerLeave={() => setHovered(null)}
                onFocus={() => setHovered(key)}
                onBlur={() => setHovered(null)}
                onClick={() => setOpened((current) => (current === key ? null : key))}
              >
                <span aria-hidden className="kind-dot" style={{ backgroundColor: row.color }} />
                {row.label}
              </button>
            </li>
          ))}
        </ul>
      </div>

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

/** 停在一类上时，中间金额下面写的两行：占开销几成、排了多久占时间几成。分两行写，一行太长会顶出环中间那个洞。 */
function ringCenterDetail(row: RingRow): string[] {
  const money = row.moneyPercent === null ? null : `占开销 ${row.moneyPercent}%`;
  const time =
    row.minutes > 0 && row.timePercent !== null ? `${durationLabel(row.minutes)} · 占时间 ${row.timePercent}%` : "没排时间";
  return [money, time].filter((part): part is string => part !== null);
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
