import {
  followerCounts,
  passesFilter,
  type BlockMark,
  type KindView,
  type LibraryView,
  type PlanView,
  type StatsFilter,
  type TagView,
} from "@welshonion/core";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type * as Y from "yjs";
import { Menu } from "../app/Menu";
import { blockFocusSelector } from "./block-actions";
import { bulkItems } from "./bulk-actions";
import { useNotifyDone } from "./DoneNotice";
import { BlockPanel } from "./BlockPanel";
import { dayNumbers, dayRowLabels } from "./day-labels";
import { DayFilter, type FilterDay } from "./DayFilter";
import { DayRow } from "./DayRow";
import { OverviewCards } from "./OverviewCards";
import { FilterChips, chipClass } from "./FilterChips";
import { MARK_LABEL, MarkIcon } from "./mark";
import { BulkIcon, CollapseIcon, ExpandIcon, PinIcon } from "./icons";
import { formatYuan } from "./money";
import { moneyCells, moneyOnHiddenBlocks } from "./money-cells";
import { OpenBlockContext, type OpenBlock } from "./open-block";
import { readBlockText, saveBlockText } from "./plan-block-text-memory";
import { readPhoneZoom, savePhoneZoom } from "./plan-phone-zoom-memory";
import { readTimelineFullDay, saveTimelineFullDay } from "./plan-timeline-full-day-memory";
import { readTimelineZoom, saveTimelineZoom, ZOOM_MAX, ZOOM_MIN } from "./plan-timeline-zoom-memory";
import { readTitleLines, saveTitleLines, TITLE_LINES_MAX, TITLE_LINES_MIN } from "./plan-title-lines-memory";
import { readPlanView, savePlanView, type PlanViewName } from "./plan-view-memory";
import { useWideScreen } from "../app/use-wide-screen";
import { PlanSearch } from "./PlanSearch";
import { SelectBlockContext, type BlockSelection } from "./select-block";
import { BLOCK_TEXT_DEFAULT, PHONE_BLOCK_TEXT_DEFAULT, type BlockText } from "./timeline-geometry";
import { FULL_DAY, hourWindow } from "./timeline-window";
import { Timeline } from "./Timeline";
import { useTopPeek } from "./use-top-peek";

const VIEWS = [
  { value: "timeline", label: "时间线" },
  { value: "list", label: "日程" },
  { value: "overview", label: "总览" },
] as const;

/** 条上写什么：两个开关，各开各关 */
const BLOCK_TEXT_PARTS = [
  { value: "title", label: "标题" },
  { value: "duration", label: "时长" },
  { value: "money", label: "开销" },
] as const;

/** 筛选里三档的顺序：还没定的排最前面，最常想先看 */
const MARKS: BlockMark[] = ["pending", "decided", "done"];

/** 页顶那一行钉在屏幕顶上时，离上边多少像素 */
const PINNED_TOP = 0;

interface DayListProps {
  /** 页顶那一行（返回、计划名、搜索、设置、撤销、重做）：往下滚时钉在屏幕顶上，下面接着筛选和切换按钮 */
  top: ReactNode;
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  /** 按计划记住上次看的是时间线还是日程 */
  planId: string;
  /** 搜索面板开着时贴着的按钮（页顶的「搜索」）；没开是 null */
  searchAnchor: HTMLButtonElement | null;
  /** 搜索面板关掉了（按了 Esc、点了外面，或者点了结果） */
  onSearchClosed: () => void;
}

/** 详情面板开着哪件事：谁点开的（关掉后焦点回到它）、打开时焦点放哪 */
interface OpenedBlock {
  blockId: string;
  /** 点开它的那个按钮：气泡贴着它弹出，关掉后焦点回到它 */
  opener: HTMLElement;
}

/**
 * 计划页的主体：一行筛选（按类型、按标签、只看没完成的），下面「时间线」「日程」「总览」三个视图切换着看。
 * 日程视图是每天一个组头和它的时刻表；总览视图是开销总览、每天和占比。计划里至少有一天。
 * 按下了哪些类型、标签，只看没完成的，只放在这里（不进计划文档、不进撤销），筛选合成一个条件往下传给时间线、开销、占比和每一天；
 * 看的是哪个视图按计划记在这台设备上。一件事的详情面板也放在这里：几个视图打开的是同一个，切换视图面板留着。
 */
export function DayList({ top, doc, library, libraryView, plan, planId, searchAnchor, onSearchClosed }: DayListProps) {
  const bases = plan.bases;
  const labels = dayRowLabels(bases);
  const notifyDone = useNotifyDone();

  // 类型、标签删掉了，按下过的就不算了
  const [selectedKinds, setSelectedKinds] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  // 按标记筛：三档「待定」「确定」「完成」，和类型、标签一样多选，都不按下就是三档都看
  const [selectedMarks, setSelectedMarks] = useState<BlockMark[]>([]);
  // 按天筛（底座 id）：删掉的那天不算了
  const [selectedDays, setSelectedDays] = useState<string[]>([]);

  const [view, setView] = useState<PlanViewName>(() => readPlanView(planId));
  const wide = useWideScreen();
  // 时间线的条上写标题、时长、开销（各开各关）：也按计划记在这台设备上。手机上管的是展开那天条下面那几行，默认多写时长
  const [blockText, setBlockText] = useState<BlockText>(() =>
    readBlockText(planId, wide ? BLOCK_TEXT_DEFAULT : PHONE_BLOCK_TEXT_DEFAULT),
  );
  const toggleBlockText = (part: "title" | "duration" | "money") => {
    const next = { ...blockText, [part]: !blockText[part] };
    setBlockText(next);
    saveBlockText(planId, next);
  };
  // 时间线横向放到百分之几：也按计划记在这台设备上
  const [zoom, setZoom] = useState(() => readTimelineZoom(planId));
  const setShownZoom = (next: number) => {
    setZoom(next);
    saveTimelineZoom(planId, next);
  };
  // 手机上整条时间线放大几倍（双指捏合）：也按计划记在这台设备上
  const [phoneZoom, setPhoneZoom] = useState(() => readPhoneZoom(planId));
  const setShownPhoneZoom = (next: number) => {
    setPhoneZoom(next);
    savePhoneZoom(planId, next);
  };
  // 横条上的标题写几行（你提的：跟横向放大一样的上下维度拉动条）：也按计划记在这台设备上
  const [titleLines, setTitleLines] = useState(() => readTitleLines(planId));
  const setShownTitleLines = (next: number) => {
    setTitleLines(next);
    saveTitleLines(planId, next);
  };
  // 横排横轴画哪几个钟点：没按「0–24 点」时折起没事的凌晨和深夜；按没按下也按计划记在这台设备上
  const [fullDay, setFullDay] = useState(() => readTimelineFullDay(planId));
  const showFullDay = (next: boolean) => {
    setFullDay(next);
    saveTimelineFullDay(planId, next);
  };
  const foldedHours = useMemo(() => hourWindow(plan, libraryView, false), [plan, libraryView]);
  const foldable = foldedHours.from > FULL_DAY.from || foldedHours.to < FULL_DAY.to;
  // 手机上时间线展开的是哪天（底座 id）：切到日程时时间线卸掉，切回来还是这天
  const shownDay = useRef<string | null>(null);
  // 零高度的标记放在页顶那一行本来的位置：页顶那一行钉在顶上时，靠它量出不钉住该在哪
  const viewsMarker = useRef<HTMLDivElement>(null);
  // 顶上两截（你提的：要 B，折叠）：页顶那一行（topBar）往下滚时钉在屏幕顶上；筛选和切换按钮（topDrawer）平时跟着页面滚走，
  // 鼠标移上来、固定了、键盘走进来时钉在页顶那一行下面。钉没钉住、弹没弹出来直接改 topArea 上的属性，不走 state：不用重画整个计划
  const topArea = useRef<HTMLElement>(null);
  const topBar = useRef<HTMLDivElement>(null);
  const topDrawer = useRef<HTMLDivElement>(null);
  // 固定（你提的：如果点击，就是固定住）：不记住，重新打开计划是收起的
  const [topPinned, setTopPinned] = useState(false);
  const peek = useTopPeek(topArea, topDrawer);
  useLayoutEffect(() => {
    const area = topArea.current!;
    const bar = topBar.current!;
    const drawer = topDrawer.current!;
    const root = document.documentElement;
    // 两截多高写进页面：弹出来那截钉在 --top-bar 下面；视图的最小高度按 --top-area 算；滚动时顶上留多少（--stuck-top）CSS 按固不固定算
    const measure = () => {
      root.style.setProperty("--top-bar", `${bar.offsetHeight}px`);
      root.style.setProperty("--top-area", `${bar.offsetHeight + drawer.offsetHeight}px`);
    };
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(bar);
    resize.observe(drawer);
    // 标记滚出屏幕上边就是钉住了：这时页顶那一行才上底色，筛选和切换按钮才收起。没钉住时和页面融在一起，不是一块浮着的板子
    const stuck = new IntersectionObserver(([marker]) => area.toggleAttribute("data-stuck", !marker!.isIntersecting));
    stuck.observe(viewsMarker.current!);
    return () => {
      resize.disconnect();
      stuck.disconnect();
      root.style.removeProperty("--top-bar");
      root.style.removeProperty("--top-area");
    };
  }, []);
  const [viewClicks, setViewClicks] = useState(0);
  const showView = (next: PlanViewName) => {
    setView(next);
    savePlanView(planId, next);
    setViewClicks((count) => count + 1);
  };
  // 点了切换按钮（按下的那个也算）：
  // - 页顶那一行在它本来的位置（页面在最上面，没钉住）：不滚，新视图就在切换按钮下面（你提的：「维持不动就行」）
  // - 页顶那一行钉在顶上（往下滚过了）：滚到标记在屏幕上边——页顶、筛选、切换按钮都回到原处，新视图从开头露出来。
  //   不滚的话，新视图停在刚才滚到的地方，看的是中间一截
  // 画完新视图再量：标记跑到钉住的位置上面就是钉住了。新视图比一屏短时浏览器先把滚动夹小，下面至少一屏高的框让它正好夹到钉住
  useLayoutEffect(() => {
    if (viewClicks === 0) return;
    const offset = viewsMarker.current!.getBoundingClientRect().top - PINNED_TOP;
    if (offset < 0) window.scrollBy(0, offset);
  }, [viewClicks]);

  // 时间线上选中的是哪一件、点的是哪一行（跨午夜的块点哪一段，快捷条就贴哪一段）
  const [selected, setSelected] = useState<{ blockId: string; baseId: string | null } | null>(null);
  const selectedBlock = selected === null ? undefined : plan.blocks.get(selected.blockId);

  const [opened, setOpened] = useState<OpenedBlock | null>(null);
  const openBlock = useCallback<OpenBlock>((blockId, opener) => setOpened({ blockId, opener }), []);
  const openedBlock = opened === null ? undefined : plan.blocks.get(opened.blockId);
  // 这件事没了（撤销掉了、别的标签页删了），气泡自己关
  if (opened !== null && openedBlock === undefined) setOpened(null);
  const closePanel = () => {
    const closing = opened!;
    setOpened(null);
    if (closing.opener.isConnected) closing.opener.focus();
    // 等改动画出来再看焦点：点开它的按钮没了（换了行、切了视图），放到这件事现在的按钮上
    requestAnimationFrame(() => {
      if (document.activeElement !== null && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(blockFocusSelector(closing.blockId))?.focus();
    });
  };

  const kindKey = selectedKinds.filter((id) => libraryView.kinds.has(id)).join(",");
  const tagKey = selectedTags.filter((id) => libraryView.tags.has(id)).join(",");
  const markKey = selectedMarks.join(",");
  const dayKey = selectedDays.filter((id) => bases.some((base) => base.id === id)).join(",");
  const filter = useMemo<StatsFilter | undefined>(() => {
    if (kindKey === "" && tagKey === "" && markKey === "" && dayKey === "") return undefined;
    return {
      ...(kindKey === "" ? {} : { kindIds: kindKey.split(",") }),
      ...(tagKey === "" ? {} : { tagIds: tagKey.split(",") }),
      ...(markKey === "" ? {} : { marks: markKey.split(",") as BlockMark[] }),
      ...(dayKey === "" ? {} : { baseIds: dayKey.split(",") }),
    };
  }, [kindKey, tagKey, markKey, dayKey]);
  // 开销格的摘要整份算一次：共用的开销要看全计划才知道显示在哪块
  const cells = useMemo(() => moneyCells(plan, filter), [plan, filter]);
  // 每件事会带走几件（删除写「连同 N 件」）也整份算一次：一行行各算，大计划一次要换算几万次
  const followers = useMemo(() => followerCounts(plan, libraryView), [plan, libraryView]);
  // 「复制到…」列出的每一天
  const dayChoices = bases.map((base, index) => ({ baseId: base.id, label: labels[index]! }));
  const hiddenCents = useMemo(() => moneyOnHiddenBlocks(plan, filter), [plan, filter]);

  // 选中的那件没了（删了、撤销掉了）、被筛掉了、切到了日程：取消选中
  const filteredOutDay = useRef<string | null>(null);
  if (selected !== null && (view !== "timeline" || selectedBlock === undefined || !passesFilter(selectedBlock, filter))) {
    if (view === "timeline" && selectedBlock !== undefined) filteredOutDay.current = selectedBlock.start_base_id;
    setSelected(null);
  }
  // 在快捷条里改了类型、摘了标签，这件事被筛掉：快捷条和它上面的弹层一起没了，焦点落到这天的菜单（和从快捷条删掉一样）。
  // 焦点还在别处（点的是筛选按钮）就不动
  useEffect(() => {
    const baseId = filteredOutDay.current;
    if (baseId === null) return;
    filteredOutDay.current = null;
    requestAnimationFrame(() => {
      if (document.activeElement !== null && document.activeElement !== document.body) return;
      document.querySelector<HTMLElement>(`[data-base-id="${baseId}"] button[aria-label="这天的操作"]`)?.focus();
    });
  });
  const selection = useMemo<BlockSelection>(
    () => ({
      selectedId: selected?.blockId ?? null,
      anchorBaseId: selected?.baseId ?? null,
      toggle: (blockId, baseId) => {
        setSelected((current) => (current?.blockId === blockId ? null : { blockId, baseId }));
        setOpened(null);
      },
      select: (blockId, baseId) => {
        setSelected({ blockId, baseId });
        setOpened(null);
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
  // 点时间线的空白处、页面别处就取消选中；点另一件事、快捷条、弹层里的不算（各自有事要做），
  // 手机上点底部浮起的卡片后面的暗底也不算（它和点「关闭」一样，只关卡片）
  useEffect(() => {
    if (selected === null) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      const keep = "[data-block-id], [data-quick-bar], [role='dialog'], [role='menu'], [data-card-backdrop]";
      if (target instanceof Element && target.closest(keep)) return;
      setSelected(null);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [selected]);
  // 搜索里点了一条：跳到那件事。被筛选挡住先清筛选；总览切到时间线；
  // 时间线上选中它，手机上展开它那天（PhoneTimeline 看 jump.seq 变了就展开那天）。画完再滚到屏幕中间、焦点放上去。
  // 总览「每天」里点了一天的日期（blockId 是 null）：切到时间线、手机上展开那天，焦点放到那天的「这天的操作」
  const [jump, setJump] = useState<{ blockId: string | null; baseId: string; seq: number } | null>(null);
  const jumpToBlock = (blockId: string) => {
    const block = plan.blocks.get(blockId)!;
    if (!passesFilter(block, filter)) {
      setSelectedKinds([]);
      setSelectedTags([]);
      setSelectedMarks([]);
    }
    if (view === "overview") showView("timeline");
    if (view !== "list") setSelected({ blockId, baseId: null });
    setOpened(null);
    shownDay.current = block.start_base_id;
    setJump({ blockId, baseId: block.start_base_id, seq: (jump?.seq ?? 0) + 1 });
  };
  const jumpToDay = (baseId: string) => {
    showView("timeline");
    shownDay.current = baseId;
    setJump({ blockId: null, baseId, seq: (jump?.seq ?? 0) + 1 });
  };
  useEffect(() => {
    if (jump === null) return;
    if (jump.blockId === null) {
      // 切视图那一下已经把时间线摆好了（贴着顶就从开头露出来）：那天的按钮看得见就不再滚
      const menu = document.querySelector<HTMLElement>(`[data-base-id="${jump.baseId}"] button[aria-label="这天的操作"]`)!;
      menu.scrollIntoView({ block: "nearest" });
      menu.focus({ preventScroll: true });
      return;
    }
    const target = document.querySelector<HTMLElement>(blockFocusSelector(jump.blockId))!;
    target.scrollIntoView({ block: "center", inline: "center" });
    target.focus();
  }, [jump]);

  const kinds = usedKinds(plan, libraryView, filter?.kindIds ?? []);
  // 只用到一种类型时按下去也筛不掉：那一排不出现；按下过就一直留着，不然取消不了
  const showKindFilter = kinds.length >= 2 || (filter?.kindIds?.length ?? 0) > 0;
  // 标签是挂不挂的事：挂了一个就筛得出东西；一件都没挂、也没按下过就不出现
  const tags = usedTags(plan, libraryView, filter?.tagIds ?? []);
  const showTagFilter = tags.length > 0;
  // 三档都是「确定」时按下去也筛不掉：不出现；按下过就留着
  const showMarkFilter =
    selectedMarks.length > 0 || [...plan.blocks.values()].some((block) => block.mark !== "decided");
  // 看得见的那几件：「对这 N 件…」对它们一起做
  const shownBlocks = useMemo(
    () => [...plan.blocks.values()].filter((block) => passesFilter(block, filter)),
    [plan, filter],
  );
  // 「天」：一天的计划筛了也没意义（选它和不选一样）
  const filterDays = useMemo<FilterDay[]>(() => {
    const numbers = dayNumbers(bases);
    return bases.map((base, index) => ({ id: base.id, number: numbers[index]!, label: labels[index]! }));
  }, [bases, labels]);
  // 两天起才有得筛；一件事都没有时筛了也是空的，不摆这个按钮（已经按下的留着，不然取消不了）
  const showDayFilter = filterDays.length >= 2 && (plan.blocks.size > 0 || dayKey !== "");
  // 按天筛时，没选中的那天整天不出现在日程里：筛的就是「只看这几天」，留一排空日子只会挡路
  const shownBaseIds = filter?.baseIds;

  // 一键批量：范围就是现在看得见的那几件（你提的：全部打上、某天打上；某天在每天的菜单里）。
  // 手机上放在筛选那一行最前面：那一行摆不下时左右滑，放在最后类型一多就被挤到屏幕外面，等于找不着
  const bulkMenu = shownBlocks.length > 0 && (
              <Menu
                label={`对这 ${shownBlocks.length} 件事`}
                triggerClassName="inline-flex h-8 items-center gap-1.5 rounded-full border border-ink/10 bg-white/70 px-3 text-sm text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage"
                items={bulkItems({
                  doc,
                  library,
                  libraryView,
                  blocks: shownBlocks,
                  notify: notifyDone,
                  // 撤销后焦点回到这个按钮本身（件数变了名字也还是「对这 … 件事」）
                  focusAfterUndo: 'button[aria-label^="对这 "]',
                })}
              >
                <span className="inline-flex items-center gap-1.5">
                  <BulkIcon />
                  {`对这 ${shownBlocks.length} 件…`}
                </span>
              </Menu>
  );

  return (
    // -mt-2 抵掉页顶那一行上边留的 8 像素：页面在最上面时页顶还在原处，和还没加天时一样
    <section ref={topArea} data-top-pinned={topPinned || undefined} className="-mt-2 flex flex-col gap-4">
      {/* -mb-4 抵掉标记后面那道间距，页顶那一行还在原来的位置 */}
      <div ref={viewsMarker} aria-hidden className="-mb-4" />
      {/*
        页顶那一行：往下滚时钉在屏幕顶上，成一张和每天一样宽、一样料的玻璃卡片（见 index.css 的 top-bar）。
        鼠标移上来，下面的筛选和切换按钮弹出来；触屏上没有鼠标，收起时下面挂「展开」，点了等于固定
      */}
      <div ref={topBar} data-top-bar className="top-bar" {...peek}>
        {top}
        <button
          type="button"
          data-top-expand
          aria-label="展开筛选和视图"
          className="top-tab"
          onClick={() => setTopPinned(true)}
        >
          <ExpandIcon />
          展开
        </button>
      </div>
      {/*
        筛选和切换按钮：平时是普通的一截，往下滚就从页顶那一行底下滚走（收起）；
        弹出来、固定了钉在页顶那一行下面，连成一张（见 index.css 的 top-drawer）
      */}
      <div ref={topDrawer} data-top-drawer className="top-drawer flex flex-col gap-3" {...peek}>
        {/* 筛选挤在一行里：主版面只留筛选、切换和视图本身，出发日期这类不常改的进了计划设置 */}
        {(showKindFilter || showTagFilter || showMarkFilter || showDayFilter || shownBlocks.length > 0) && (
          <div data-filter-row className="filter-row flex flex-wrap items-center gap-x-5 gap-y-2">
            {!wide && bulkMenu}
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
            {showTagFilter && (
              <FilterChips
                label="按标签筛选"
                lead="标签"
                clearLabel="全部标签"
                marker="ribbon"
                items={tags}
                selected={filter?.tagIds ?? []}
                onChange={setSelectedTags}
              />
            )}
            {showMarkFilter && (
              <div role="group" aria-label="按标记筛选" className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-ink-muted">标记</span>
                {MARKS.map((mark) => {
                  const pressed = selectedMarks.includes(mark);
                  return (
                    <button
                      key={mark}
                      type="button"
                      aria-pressed={pressed}
                      className={chipClass(pressed)}
                      onClick={() =>
                        setSelectedMarks(pressed ? selectedMarks.filter((one) => one !== mark) : [...selectedMarks, mark])
                      }
                    >
                      <MarkIcon mark={mark} />
                      {MARK_LABEL[mark]}
                    </button>
                  );
                })}
                {selectedMarks.length > 0 && (
                  <button type="button" className="btn btn-ghost h-8 px-2" onClick={() => setSelectedMarks([])}>
                    全部标记
                  </button>
                )}
              </div>
            )}
            {/* 天数可以十几个，一行摆不下：这个是按钮，点开才一天一行（见 DayFilter） */}
            {showDayFilter && (
              <DayFilter days={filterDays} selected={filter?.baseIds ?? []} onChange={setSelectedDays} />
            )}
            {wide && bulkMenu}
          </div>
        )}
        {/* 右边是只在时间线上有意义的两样（你提的：放到这一行，居右） */}
        <div data-view-row className="flex flex-wrap items-center justify-between gap-2">
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
          {/* 「条上写」两边都有（手机上管展开那天条下面那几行）；后面三样只在电脑上：手机上横轴固定不放大、不折起，色块不写字 */}
          {view === "timeline" && (
            // 放不下时整组换到下一行，不挤扁组里的按钮
            <div className="flex flex-wrap items-center justify-end gap-2">
              {/* 条上写标题、时长、开销：各开各关（记在这台设备上） */}
              <div
                role="group"
                aria-label="条上写"
                className="flex shrink-0 rounded-full border border-ink/10 bg-white/85 p-1 shadow-sm backdrop-blur"
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
              {/* 0–24 点：按下是整天按真实比例画，没按下折起没事的凌晨和深夜（只有横排有） */}
              {wide && (
                <div className="flex rounded-full border border-ink/10 bg-white/85 p-1 shadow-sm backdrop-blur">
                  <button
                    type="button"
                    aria-pressed={fullDay}
                    disabled={!foldable}
                    title={foldable ? (fullDay ? "折起没事的凌晨和深夜" : "展开成 0–24 点") : "每个钟点都有事，没有折起的"}
                    className={`inline-flex h-8 items-center rounded-full px-3 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage disabled:cursor-default disabled:opacity-50 ${
                      fullDay ? "bg-sage text-white" : "text-ink-muted enabled:hover:text-ink"
                    }`}
                    onClick={() => showFullDay(!fullDay)}
                  >
                    0–24 点
                  </button>
                </div>
              )}
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
              {/* 文字行数：横条中间写标题的那一区写几行，上下的书签栏、附件栏不变（只在宽屏有；手机上的色块不写字） */}
              {wide && (
                <div className="flex items-center gap-2 text-xs text-ink-muted">
                  <input
                    type="range"
                    aria-label="文字行数"
                    aria-valuetext={`${titleLines} 行`}
                    title={blockText.title ? `条上的标题写 ${titleLines} 行` : "关着「标题」时条上不写字"}
                    className="timeline-lines"
                    min={TITLE_LINES_MIN}
                    max={TITLE_LINES_MAX}
                    step={1}
                    value={titleLines}
                    disabled={!blockText.title}
                    onChange={(event) => setShownTitleLines(Number(event.target.value))}
                  />
                  <span className="w-8 text-right tabular-nums">{`${titleLines} 行`}</span>
                </div>
              )}
            </div>
          )}
        </div>
        {/*
          右下角挂着：弹出来时「固定」，固定了「收起」（你提的：如果点击，就是固定住）。点筛选、切换按钮不算固定：
          选完一挪开鼠标它就让开，正好看结果。同一个按钮换字，键盘按了焦点还在它上面
        */}
        <button
          type="button"
          data-top-pin
          aria-label={topPinned ? "收起筛选和视图" : "固定筛选和视图"}
          className="top-tab"
          onClick={() => setTopPinned((pinned) => !pinned)}
        >
          {topPinned ? <CollapseIcon /> : <PinIcon />}
          {topPinned ? "收起" : "固定"}
        </button>
      </div>
      <OpenBlockContext.Provider value={openBlock}>
        <SelectBlockContext.Provider value={selection}>
          {/*
            至少一屏高（减去顶上两截、间距 16、页面底边 32）：视图比一屏短时，钉着切过来照样滚得到、视图从开头露出来。
            单独一层（isolate）：时间线里浮着的快捷条、日程停住的「第几天」层次再高也只在视图里比，滚到顶上两截底下时被盖住
          */}
          <div className="isolate flex min-h-[calc(100dvh-var(--top-area,8rem)-3rem)] flex-col gap-4">
            {view === "overview" ? (
              <OverviewCards
                doc={doc}
                library={library}
                libraryView={libraryView}
                plan={plan}
                planId={planId}
                filter={filter}
                onJump={jumpToBlock}
                onOnlyKind={(kindId) => setSelectedKinds([kindId])}
              />
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
                phoneZoom={phoneZoom}
                onPhoneZoom={setShownPhoneZoom}
                titleLines={titleLines}
                hours={fullDay ? FULL_DAY : foldedHours}
                onExpandHours={() => showFullDay(true)}
                shownDay={shownDay}
                jump={jump}
              />
            ) : (
              <>
                {/* 按类型筛时，开销算进了总览、时刻表里却找不到它挂的块：写出来，时刻表和总览才对得上 */}
                {hiddenCents > 0 && (
                  <p data-hidden-money className="text-sm text-ink-muted">
                    {`有 ${formatYuan(hiddenCents)} 挂在被筛掉的事上`}
                  </p>
                )}
                <ol aria-label="每天" className="flex flex-col gap-3">
                  {/* 按天筛时没选中的那天整天不画；序号和总数还按全部天算（菜单里的「上移」「下移」看的是真实位置） */}
                  {bases.map((base, index) =>
                    shownBaseIds !== undefined && !shownBaseIds.includes(base.id) ? null : (
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
                        followerCounts={followers}
                        dayChoices={dayChoices}
                        filter={filter}
                      />
                    ),
                  )}
                </ol>
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
          anchor={opened.opener}
          onClose={closePanel}
        />
      )}
      {searchAnchor && (
        <PlanSearch
          plan={plan}
          filter={filter}
          anchor={searchAnchor}
          onClose={() => {
            onSearchClosed();
            searchAnchor.focus();
          }}
          onPick={(blockId) => {
            onSearchClosed();
            jumpToBlock(blockId);
          }}
        />
      )}
    </section>
  );
}

/** 「类型」那一排：这个计划的块和开销用到的类型，加上按下的（没人用了也留着），按类型的顺序。 */
/** 这个计划里挂着的标签（加上按下过的），按标签的顺序。 */
function usedTags(plan: PlanView, libraryView: LibraryView, pressed: readonly string[]): TagView[] {
  const ids = new Set<string>(pressed);
  for (const block of plan.blocks.values()) for (const id of block.tag_ids) ids.add(id);
  return [...ids]
    .map((id) => libraryView.tags.get(id))
    .filter((tag): tag is TagView => tag !== undefined)
    .sort((a, b) => a.order - b.order);
}

function usedKinds(plan: PlanView, libraryView: LibraryView, pressed: readonly string[]): KindView[] {
  const ids = new Set<string>(pressed);
  for (const block of plan.blocks.values()) ids.add(block.kind.id);
  for (const expense of plan.expenses.values()) ids.add(expense.kind.id);
  return [...ids]
    .map((id) => libraryView.kinds.get(id))
    .filter((kind): kind is KindView => kind !== undefined)
    .sort((a, b) => a.order - b.order);
}
