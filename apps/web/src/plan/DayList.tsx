import { shiftAllDays, type KindView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { blockFocusSelector } from "./block-actions";
import { BlockPanel } from "./BlockPanel";
import { dayRowLabels, daysBetween } from "./day-labels";
import { DayRow } from "./DayRow";
import { FilterChips, chipClass } from "./FilterChips";
import { KindGroups } from "./KindGroups";
import { formatYuan } from "./money";
import { moneyCells, moneyOnHiddenBlocks } from "./money-cells";
import { MoneyOverview } from "./MoneyOverview";
import { OpenBlockContext, type OpenBlock, type PanelFocus } from "./open-block";
import { readPlanView, savePlanView, type PlanViewName } from "./plan-view-memory";
import { SharesCard } from "./SharesCard";
import { Timeline } from "./Timeline";

const VIEWS = [
  { value: "timeline", label: "时间轴" },
  { value: "list", label: "列表" },
] as const;

const GROUPINGS = [
  { value: "day", label: "按天" },
  { value: "kind", label: "按类型" },
] as const;

/** 切换视图的按钮贴在屏幕顶上时，离上边多少像素 */
const VIEWS_STICKY_TOP = 8;

interface DayListProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  /** 按计划记住上次看的是时间轴还是列表 */
  planId: string;
}

/** 详情面板开着哪件事：谁点开的（关掉后焦点回到它）、打开时焦点放哪 */
interface OpenedBlock {
  blockId: string;
  opener: HTMLElement;
  focus: PanelFocus;
}

/**
 * 计划页的主体：出发日期、按状态和类型筛选、钱的总览、占比，下面「时间轴」「列表」两个视图切换着看。
 * 列表视图是每天一个组头和它的安排表（或按类型分组）；出发日期一改，整趟一起平移。计划里至少有一天。
 * 按下了哪些状态、类型、怎么分组只放在这里（不进计划文档、不进撤销），筛选合成一个条件往下传给时间轴、钱、占比和每一天；
 * 看的是哪个视图按计划记在这台设备上。一件事的详情面板也放在这里：两个视图打开的是同一个，切换视图面板留着。
 */
export function DayList({ doc, library, libraryView, plan, planId }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);
  const firstDate = bases[0]!.date;

  // 状态、类型删掉了，按下过的就不算了
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  // 按天还是按类型分组，也只在这一页
  const [grouping, setGrouping] = useState<"day" | "kind">("day");
  const pressedGrouping = useRef<HTMLButtonElement>(null);

  const [view, setView] = useState<PlanViewName>(() => readPlanView(planId));
  // 竖排看的是哪天（底座 id）：切到列表时时间轴卸掉，切回来接着看这天
  const shownDay = useRef<string | null>(null);
  // 零高度的标记放在切换按钮本来的位置：按钮贴在顶上时，靠它量出按钮不贴顶该在哪
  const viewsMarker = useRef<HTMLDivElement>(null);
  const [viewClicks, setViewClicks] = useState(0);
  const showView = (next: PlanViewName) => {
    setView(next);
    savePlanView(planId, next);
    setViewClicks((count) => count + 1);
  };
  // 点了切换按钮（按下的那个也算）：新视图画完，把页面滚到按钮贴在顶上、视图从开头露出来。
  // 不滚的话，第一屏差不多被筛选、钱、占比占满，换掉的内容在屏幕外面，看不出点上了
  useLayoutEffect(() => {
    if (viewClicks === 0) return;
    window.scrollBy(0, viewsMarker.current!.getBoundingClientRect().top - VIEWS_STICKY_TOP);
  }, [viewClicks]);

  const [opened, setOpened] = useState<OpenedBlock | null>(null);
  const openBlock = useCallback<OpenBlock>((blockId, opener, focus = "panel") => setOpened({ blockId, opener, focus }), []);
  const openedBlock = opened === null ? undefined : plan.blocks.get(opened.blockId);
  // 这件事没了（撤销掉了、别的标签页删了），面板自己关
  if (opened !== null && openedBlock === undefined) setOpened(null);
  const closePanel = (deletedFromBaseId?: string) => {
    const closing = opened!;
    setOpened(null);
    if (deletedFromBaseId === undefined && closing.opener.isConnected) closing.opener.focus();
    // 等改动画出来再看焦点：点开它的按钮没了（换了行、切了视图），放到这件事现在的按钮上；
    // 删掉了的，列表里安排表自己落到下一行，时间轴上落到那天的「这天的操作」
    requestAnimationFrame(() => {
      if (document.activeElement !== null && document.activeElement !== document.body) return;
      const selector =
        deletedFromBaseId === undefined
          ? blockFocusSelector(closing.blockId)
          : `[data-base-id="${deletedFromBaseId}"] button[aria-label="这天的操作"]`;
      document.querySelector<HTMLElement>(selector)?.focus();
    });
  };

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
      {/* 一件事都没有时筛不掉任何东西，不出这一排；按下了就一直留着，不然取消不了 */}
      {(plan.blocks.size > 0 || (filter?.statusIds?.length ?? 0) > 0) && (
        <FilterChips
          label="按状态筛选"
          lead="只看"
          clearLabel="全部显示"
          items={statuses}
          selected={filter?.statusIds ?? []}
          onChange={setSelectedStatuses}
        />
      )}
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
      <MoneyOverview doc={doc} library={library} libraryView={libraryView} plan={plan} filter={filter} />
      <SharesCard libraryView={libraryView} plan={plan} filter={filter} />
      {/* -mb-4 抵掉标记后面那道间距，切换按钮还在原来的位置 */}
      <div ref={viewsMarker} aria-hidden className="-mb-4" />
      {/* 往下滚时贴在屏幕顶上：列表多长都不用滚回来切换 */}
      <div
        role="group"
        aria-label="视图"
        className="sticky z-20 flex self-start rounded-full border border-ink/10 bg-white/85 p-1 shadow-sm backdrop-blur"
        style={{ top: VIEWS_STICKY_TOP }}
      >
        {VIEWS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            aria-pressed={view === value}
            className={`inline-flex h-8 items-center rounded-full px-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
              view === value ? "bg-sage text-white" : "text-ink-muted hover:text-ink"
            }`}
            onClick={() => showView(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <OpenBlockContext.Provider value={openBlock}>
        {/* 至少一屏高（减去切换按钮 42 像素、贴顶的 8、间距 16、页面底边 32）：视图比一屏短时，点切换按钮照样滚得到贴顶 */}
        <div className="flex min-h-[calc(100dvh-6.125rem)] flex-col gap-4">
          {view === "timeline" ? (
            <Timeline
              doc={doc}
              library={library}
              plan={plan}
              libraryView={libraryView}
              filter={filter}
              shownDay={shownDay}
            />
          ) : (
            <>
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
                  {`有 ${formatYuan(hiddenCents)} 挂在被筛掉的事上`}
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
            </>
          )}
        </div>
      </OpenBlockContext.Provider>
      {opened !== null && openedBlock !== undefined && (
        <BlockPanel
          key={opened.blockId}
          doc={doc}
          library={library}
          libraryView={libraryView}
          plan={plan}
          block={openedBlock}
          moneyCell={cells.get(opened.blockId)}
          focus={opened.focus}
          onClose={closePanel}
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
