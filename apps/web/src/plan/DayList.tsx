import { passesFilter, type KindView, type LibraryView, type PlanView, type StatsFilter } from "@welshonion/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type * as Y from "yjs";
import { blockFocusSelector } from "./block-actions";
import { BlockPanel } from "./BlockPanel";
import { dayRowLabels } from "./day-labels";
import { DayRow } from "./DayRow";
import { FilterChips, chipClass } from "./FilterChips";
import { KindGroups } from "./KindGroups";
import { formatYuan } from "./money";
import { moneyCells, moneyOnHiddenBlocks } from "./money-cells";
import { MoneyOverview } from "./MoneyOverview";
import { OpenBlockContext, type OpenBlock, type PanelFocus } from "./open-block";
import { readBlockText, saveBlockText } from "./plan-block-text-memory";
import { readTimelineZoom, saveTimelineZoom, ZOOM_MAX, ZOOM_MIN } from "./plan-timeline-zoom-memory";
import { readPlanView, savePlanView, type PlanViewName } from "./plan-view-memory";
import { useWideScreen } from "../app/use-wide-screen";
import { SelectBlockContext, type BlockSelection } from "./select-block";
import type { BlockText } from "./timeline-geometry";
import { SharesCard } from "./SharesCard";
import { Timeline } from "./Timeline";

const VIEWS = [
  { value: "timeline", label: "时间轴" },
  { value: "list", label: "列表" },
  { value: "overview", label: "总览" },
] as const;

/** 块上写什么：两个开关，各开各关 */
const BLOCK_TEXT_PARTS = [
  { value: "title", label: "标题" },
  { value: "money", label: "开销" },
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
  /** 点开它的按钮；面板跟着选中换到别件时没有这个按钮，是 null（关掉时按这件事现在的按钮找焦点） */
  opener: HTMLElement | null;
  focus: PanelFocus;
}

/**
 * 计划页的主体：一行筛选（按状态、按类型），下面「时间轴」「列表」「总览」三个视图切换着看。
 * 列表视图是每天一个组头和它的安排表（或按类型分组）；总览视图是开销总览和占比。计划里至少有一天。
 * 按下了哪些状态、类型、怎么分组只放在这里（不进计划文档、不进撤销），筛选合成一个条件往下传给时间轴、开销、占比和每一天；
 * 看的是哪个视图按计划记在这台设备上。一件事的详情面板也放在这里：几个视图打开的是同一个，切换视图面板留着。
 */
export function DayList({ doc, library, libraryView, plan, planId }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);

  // 状态、类型删掉了，按下过的就不算了
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  // 按天还是按类型分组，也只在这一页
  const [grouping, setGrouping] = useState<"day" | "kind">("day");
  const pressedGrouping = useRef<HTMLButtonElement>(null);

  const [view, setView] = useState<PlanViewName>(() => readPlanView(planId));
  // 时间轴的块上写标题、开销（各开各关）：也按计划记在这台设备上
  const [blockText, setBlockText] = useState<BlockText>(() => readBlockText(planId));
  const toggleBlockText = (part: "title" | "money") => {
    const next = { ...blockText, [part]: !blockText[part] };
    setBlockText(next);
    saveBlockText(planId, next);
  };
  // 时间轴横向放到百分之几：也按计划记在这台设备上
  const [zoom, setZoom] = useState(() => readTimelineZoom(planId));
  const setShownZoom = (next: number) => {
    setZoom(next);
    saveTimelineZoom(planId, next);
  };
  const wide = useWideScreen();
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
  // 不滚的话，第一屏差不多被筛选、开销、占比占满，换掉的内容在屏幕外面，看不出点上了
  useLayoutEffect(() => {
    if (viewClicks === 0) return;
    window.scrollBy(0, viewsMarker.current!.getBoundingClientRect().top - VIEWS_STICKY_TOP);
  }, [viewClicks]);

  // 时间轴上选中的是哪一件、点的是哪一行（跨午夜的块点哪一段，快捷条就贴哪一段）
  const [selected, setSelected] = useState<{ blockId: string; baseId: string | null } | null>(null);
  const selectedBlock = selected === null ? undefined : plan.blocks.get(selected.blockId);

  const [opened, setOpened] = useState<OpenedBlock | null>(null);
  const openBlock = useCallback<OpenBlock>((blockId, opener, focus = "panel") => setOpened({ blockId, opener, focus }), []);
  // 面板开着时选中另一件：面板跟着换过去（点开它的那个「详情…」按钮跟着没了，关掉时按这件事现在的按钮找焦点）
  const followPanel = useCallback((blockId: string) => {
    setOpened((current) => (current === null || current.blockId === blockId ? current : { blockId, opener: null, focus: "panel" }));
  }, []);
  const openedBlock = opened === null ? undefined : plan.blocks.get(opened.blockId);
  // 这件事没了（撤销掉了、别的标签页删了），面板自己关
  if (opened !== null && openedBlock === undefined) setOpened(null);
  const closePanel = (deletedFromBaseId?: string) => {
    const closing = opened!;
    setOpened(null);
    if (deletedFromBaseId === undefined && closing.opener?.isConnected) closing.opener.focus();
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
  // 开销格的摘要整份算一次：共用的开销要看全计划才知道显示在哪块
  const cells = useMemo(() => moneyCells(plan, filter), [plan, filter]);
  const hiddenCents = useMemo(() => moneyOnHiddenBlocks(plan, filter), [plan, filter]);

  // 选中的那件没了（删了、撤销掉了）、被筛掉了、切到了列表：取消选中
  if (selected !== null && (view !== "timeline" || selectedBlock === undefined || !passesFilter(selectedBlock, filter))) {
    setSelected(null);
  }
  const selection = useMemo<BlockSelection>(
    () => ({
      selectedId: selected?.blockId ?? null,
      anchorBaseId: selected?.baseId ?? null,
      toggle: (blockId, baseId) => {
        setSelected((current) => (current?.blockId === blockId ? null : { blockId, baseId }));
        followPanel(blockId);
      },
      select: (blockId, baseId) => {
        setSelected({ blockId, baseId });
        followPanel(blockId);
      },
      clear: (options) => {
        setSelected(null);
        // 取消选中时块还在，焦点直接放回去
        if (options?.focusBlock && selected !== null) {
          document.querySelector<HTMLElement>(blockFocusSelector(selected.blockId))?.focus();
        }
      },
    }),
    [selected],
  );
  // 点时间轴的空白处、页面别处就取消选中；点另一件事、快捷条、弹层里的不算（各自有事要做）
  useEffect(() => {
    if (selected === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const keep = "[data-block-id], [data-quick-bar], [role='dialog'], [role='menu']";
      if (target instanceof Element && target.closest(keep)) return;
      setSelected(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected]);
  const statuses = [...libraryView.statuses.values()].sort((a, b) => a.order - b.order);
  const kinds = usedKinds(plan, libraryView, filter?.kindIds ?? []);
  // 一件事都没有时筛不掉任何东西、只有一种类型时按下去也筛不掉：那一排不出现；按下过就一直留着，不然取消不了
  const showStatusFilter = plan.blocks.size > 0 || (filter?.statusIds?.length ?? 0) > 0;
  const showKindFilter = kinds.length >= 2 || (filter?.kindIds?.length ?? 0) > 0;

  return (
    <section className="flex flex-col gap-4">
      {/* 筛选挤在一行里：主版面只留筛选、切换和视图本身，出发日期这类不常改的进了计划设置 */}
      {(showStatusFilter || showKindFilter) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {showStatusFilter && (
            <FilterChips
              label="按状态筛选"
              lead="只看"
              clearLabel="全部显示"
              items={statuses}
              selected={filter?.statusIds ?? []}
              onChange={setSelectedStatuses}
            />
          )}
          {showKindFilter && (
            <FilterChips
              label="按类型筛选"
              lead="类型"
              clearLabel="全部类型"
              items={kinds}
              selected={filter?.kindIds ?? []}
              onChange={setSelectedKinds}
            />
          )}
        </div>
      )}
      {/* -mb-4 抵掉标记后面那道间距，切换按钮还在原来的位置 */}
      <div ref={viewsMarker} aria-hidden className="-mb-4" />
      {/* 往下滚时贴在屏幕顶上：列表多长都不用滚回来切换。右边是只在时间轴上有意义的两样（你提的：放到这一行，居右） */}
      <div
        className="sticky z-20 flex flex-wrap items-center justify-between gap-2"
        style={{ top: VIEWS_STICKY_TOP }}
      >
        <div
          role="group"
          aria-label="视图"
          className="flex rounded-full border border-ink/10 bg-white/85 p-1 shadow-sm backdrop-blur"
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
        {view === "timeline" && (
          <div className="flex items-center gap-2">
            {/* 块上写标题、开销：两个开关各开各关（记在这台设备上） */}
            <div
              role="group"
              aria-label="块上写"
              className="flex rounded-full border border-ink/10 bg-white/85 p-1 shadow-sm backdrop-blur"
            >
              {BLOCK_TEXT_PARTS.map(({ value, label }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={blockText[value]}
                  className={`inline-flex h-8 items-center rounded-full px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
                    blockText[value] ? "bg-sage text-white" : "text-ink-muted hover:text-ink"
                  }`}
                  onClick={() => toggleBlockText(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {/* 横向放大：像剪辑软件那样拖着放大（只有横排有） */}
            {wide && (
              <div className="flex items-center gap-2 text-xs text-ink-muted">
                <input
                  type="range"
                  aria-label="横向放大"
                  aria-valuetext={`${zoom}%`}
                  title={`横向放大 ${zoom}%`}
                  className="timeline-zoom"
                  min={ZOOM_MIN}
                  max={ZOOM_MAX}
                  step={10}
                  value={zoom}
                  onChange={(event) => setShownZoom(Number(event.target.value))}
                />
                <span className="w-10 text-right tabular-nums">{`${zoom}%`}</span>
              </div>
            )}
          </div>
        )}
      </div>
      <OpenBlockContext.Provider value={openBlock}>
        <SelectBlockContext.Provider value={selection}>
          {/* 至少一屏高（减去切换按钮 42 像素、贴顶的 8、间距 16、页面底边 32）：视图比一屏短时，点切换按钮照样滚得到贴顶 */}
          <div className="flex min-h-[calc(100dvh-6.125rem)] flex-col gap-4">
            {view === "overview" ? (
              <>
                <MoneyOverview doc={doc} library={library} libraryView={libraryView} plan={plan} filter={filter} />
                <SharesCard libraryView={libraryView} plan={plan} filter={filter} />
              </>
            ) : view === "timeline" ? (
              <Timeline
                doc={doc}
                library={library}
                plan={plan}
                libraryView={libraryView}
                filter={filter}
                moneyCells={cells}
                blockText={blockText}
                zoom={zoom}
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
                {/* 按天、又按类型筛时，开销算进了总览、表里却找不到它挂的块：写出来，表和总览才对得上。按类型分组时开销都在组里 */}
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
        </SelectBlockContext.Provider>
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

/** 「类型」那一排：这个计划的块和开销用到的类型，加上按下的（没人用了也留着），按类型的顺序。 */
function usedKinds(plan: PlanView, libraryView: LibraryView, pressed: readonly string[]): KindView[] {
  const ids = new Set<string>(pressed);
  for (const block of plan.blocks.values()) ids.add(block.kind.id);
  for (const expense of plan.expenses.values()) ids.add(expense.kind.id);
  return [...ids]
    .map((id) => libraryView.kinds.get(id))
    .filter((kind): kind is KindView => kind !== undefined)
    .sort((a, b) => a.order - b.order);
}
