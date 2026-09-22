import { HOME_TIPS, TipBar, useTip } from "../help/tips";
import { readLibrary, type LibraryView, type PlanIndexEntryView, type PlanView } from "@welshonion/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { LateNotice } from "../app/Notice";
import { planHref } from "../app/route";
import { useLibrary, useNow, useTimeZone } from "../app/services";
import { useDocVersion } from "../app/use-doc-version";
import { chipClass } from "../plan/FilterChips";
import { todayIn } from "../plan/day-labels";
import { readPlanPreview, reconcilePlans } from "../storage/plans";
import { AppSettings } from "./AppSettings";
import { NewPlan } from "./NewPlan";
import { countdownLine, groupPlans, nextPlan, nextThingLine } from "./home-groups";
import { PlanCard } from "./PlanCard";
import { SamplePlanButton } from "./SamplePlanButton";
import { PlansCalendar } from "./PlansCalendar";

// 列表还是日历，记在这台设备上（和计划页记住看哪个视图一样，不进资料库）
const VIEW_KEY = "welshonion.plan-list-view";
const VIEWS = [
  { value: "list", label: "列表" },
  { value: "calendar", label: "日历" },
] as const;
type ListView = (typeof VIEWS)[number]["value"];

export function PlanListPage() {
  const library = useLibrary();
  const now = useNow();
  // 先对账再显示，免得先闪出一张打不开的卡再消失
  const [reconciled, setReconciled] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const [view, setView] = useState<ListView>(() => (localStorage.getItem(VIEW_KEY) === "calendar" ? "calendar" : "list"));
  const showView = (next: ListView) => {
    setView(next);
    localStorage.setItem(VIEW_KEY, next);
  };

  useEffect(() => {
    let cancelled = false;
    reconcilePlans(library, now()).then(
      () => {
        if (!cancelled) setReconciled(true);
      },
      (error: unknown) => {
        if (!cancelled) {
          setReconciled(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [library, now]);

  const version = useDocVersion(library);
  const libraryView = useMemo(() => readLibrary(library), [library, version]);
  const plans = useMemo(() => byLastOpened([...libraryView.planIndex.values()]), [libraryView]);
  const timeZone = useTimeZone();
  const today = todayIn(now(), timeZone);
  const previews = usePlanPreviews(reconciled, plans);
  const [pastOpen, setPastOpen] = useState(false);

  if (!reconciled) return <LateNotice>正在打开…</LateNotice>;

  // 导出、导入放在「设置」里，不直接摆在列表上；列表空着时也要有（换了浏览器恢复备份）
  const settings = (
    <button ref={settingsButton} type="button" className="btn btn-ghost" onClick={() => setSettingsOpen(true)}>
      设置
    </button>
  );
  const settingsPanel = settingsOpen && (
    <AppSettings
      plans={plans}
      onClose={() => {
        setSettingsOpen(false);
        settingsButton.current?.focus();
      }}
    />
  );

  if (plans.length === 0) {
    return (
      <div className="relative">
        <div className="absolute top-6 right-6">{settings}</div>
        <main className="mx-auto flex max-w-xl flex-col items-center gap-5 px-6 py-28 text-center">
          <h1 className="text-4xl font-medium tracking-wider text-ink">葱葱</h1>
          {/* 口号和它下面那一句，和官网首屏一样：口号管雅，下面这句用大白话说清特点；窄屏折行只在标点后面断，两行差不多长 */}
          <div className="flex flex-col gap-2">
            <p className="text-xl text-ink">流光可见，行程有度</p>
            <p className="break-keep text-balance text-ink-muted">每件事按时长排在时间线上，出发前哪里赶、哪里空，一眼就知道</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <NewPlan label="新建第一个计划" />
            <SamplePlanButton />
          </div>
        </main>
        {settingsPanel}
      </div>
    );
  }

  const currentYear = Number(now().slice(0, 4));
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-12">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-medium text-ink">我的计划</h1>
        <div className="flex flex-wrap items-center gap-2">
          {settings}
          <NewPlan label="新建计划" />
        </div>
      </header>
      {/* 列表是卡片，日历是月历（好几个计划放在一张月历里，你提的） */}
      <div role="group" aria-label="计划怎么看" className="-mt-2 flex gap-2 text-sm">
        {VIEWS.map(({ value, label }) => (
          <button key={value} type="button" aria-pressed={view === value} className={chipClass(view === value)} onClick={() => showView(value)}>
            {label}
          </button>
        ))}
      </div>
      {view === "list" ? (
        <PlanGroupsList
          plans={plans}
          today={today}
          nowIso={now()}
          currentYear={currentYear}
          previews={previews}
          libraryView={libraryView}
          pastOpen={pastOpen}
          onPastOpen={setPastOpen}
        />
      ) : (
        <PlansCalendar plans={plans} currentYear={currentYear} />
      )}
      {settingsPanel}
    </main>
  );
}

/**
 * 首页的列表：最上面「下一趟」大卡片，下面按时间分组（照 Apple Invites、TripIt）；已结束的默认收起。
 * 「下一趟」那一趟不在下面的组里再出现一次。
 */
function PlanGroupsList({
  plans,
  today,
  nowIso,
  currentYear,
  previews,
  libraryView,
  pastOpen,
  onPastOpen,
}: {
  plans: PlanIndexEntryView[];
  today: string;
  nowIso: string;
  currentYear: number;
  previews: ReadonlyMap<string, PlanView>;
  libraryView: LibraryView;
  pastOpen: boolean;
  onPastOpen: (open: boolean) => void;
}) {
  const groups = groupPlans(plans, today);
  const next = nextPlan(groups);
  const without = (list: PlanIndexEntryView[]) => list.filter((plan) => plan !== next);
  const card = (plan: PlanIndexEntryView) => (
    <PlanCard
      key={plan.plan_id}
      plan={plan}
      currentYear={currentYear}
      preview={previews.get(plan.plan_id)}
      libraryView={libraryView}
    />
  );
  const section = (label: string, list: PlanIndexEntryView[]) =>
    list.length > 0 && (
      <section aria-label={label} className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-ink-muted">{label}</h2>
        <ul className="plan-grid">{list.map(card)}</ul>
      </section>
    );

  return (
    <div className="flex flex-col gap-8">
      <HomeTip plans={plans.length} />
      {next !== null && (
        <section aria-label="下一趟">
          <ul className="flex flex-col">
            <PlanCard
              plan={next}
              currentYear={currentYear}
              preview={previews.get(next.plan_id)}
              libraryView={libraryView}
              featured={featuredOf(next, today, nowIso, previews.get(next.plan_id), libraryView)}
            />
          </ul>
        </section>
      )}
      {section("进行中", without(groups.ongoing))}
      {section("即将出发", without(groups.upcoming))}
      {section("还没排日期", groups.undated)}
      {groups.past.length > 0 && (
        <section aria-label="已结束" className="flex flex-col gap-3">
          <button
            type="button"
            aria-expanded={pastOpen}
            className="self-start text-sm font-medium text-ink-muted hover:text-ink"
            onClick={() => onPastOpen(!pastOpen)}
          >
            {`已结束 · ${groups.past.length} ${pastOpen ? "▾" : "▸"}`}
          </button>
          {pastOpen && <ul className="plan-grid">{groups.past.map(card)}</ul>}
        </section>
      )}
    </div>
  );
}

/** 首页顶上那条提示 */
function HomeTip({ plans }: { plans: number }) {
  const { tip, close } = useTip(HOME_TIPS, { plans });
  return tip === null ? null : <TipBar tip={tip} onClose={close} />;
}

/** 「下一趟」卡片上的标签和几行字：进行中写第几天、今天的下一件；还没出发写还有几天。 */
function featuredOf(
  plan: PlanIndexEntryView,
  today: string,
  nowIso: string,
  preview: PlanView | undefined,
  libraryView: LibraryView,
): { label: string; lines: string[] } {
  const ongoing = plan.date_start !== null && plan.date_start <= today;
  const thing = ongoing && preview ? nextThingLine(preview, libraryView, nowIso) : null;
  return { label: ongoing ? "正在进行" : "下一趟", lines: [countdownLine(plan, today), ...(thing === null ? [] : [thing])] };
}

/**
 * 每个计划的内容（迷你时间线、今天的下一件要用）：对账完挨个只读打开、读完就关（不改最近打开）。
 * 计划增删、改名时重读；读出来之前卡片先画空框。
 */
function usePlanPreviews(ready: boolean, plans: readonly PlanIndexEntryView[]): ReadonlyMap<string, PlanView> {
  const library = useLibrary();
  const [previews, setPreviews] = useState<ReadonlyMap<string, PlanView>>(new Map());
  const key = plans.map((plan) => `${plan.plan_id}:${plan.day_count}:${plan.date_start}`).join("|");
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    void (async () => {
      const next = new Map<string, PlanView>();
      for (const plan of plans) {
        const view = await readPlanPreview(library, plan.plan_id);
        if (cancelled) return;
        if (view !== null) next.set(plan.plan_id, view);
      }
      setPreviews(next);
    })();
    return () => {
      cancelled = true;
    };
    // 只在计划的增删、日期变了时重读；plans 每次都是新数组
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, library, key]);
  return previews;
}

/** 最近打开的排最前；打开时间相同的按 plan_id 排，顺序固定。 */
function byLastOpened<T extends { plan_id: string; last_opened_at: string | null }>(plans: T[]): T[] {
  const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return plans.sort(
    (a, b) => compare(b.last_opened_at ?? "", a.last_opened_at ?? "") || compare(a.plan_id, b.plan_id),
  );
}
