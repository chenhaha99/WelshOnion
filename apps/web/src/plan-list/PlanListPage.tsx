import { readLibrary } from "@welshonion/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { LateNotice } from "../app/Notice";
import { useLibrary, useNow } from "../app/services";
import { useDocVersion } from "../app/use-doc-version";
import { chipClass } from "../plan/FilterChips";
import { reconcilePlans } from "../storage/plans";
import { AppSettings } from "./AppSettings";
import { NewPlan } from "./NewPlan";
import { PlanCard } from "./PlanCard";
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
  const plans = useMemo(() => byLastOpened([...readLibrary(library).planIndex.values()]), [library, version]);

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
          <p className="text-ink-muted">把旅行排进时间轴，每天满不满、钱花在哪，一眼看得见。</p>
          <NewPlan label="新建第一个计划" />
        </main>
        {settingsPanel}
      </div>
    );
  }

  const currentYear = Number(now().slice(0, 4));
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-12">
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
        <ul className="flex flex-col gap-3">
          {plans.map((plan) => (
            <PlanCard key={plan.plan_id} plan={plan} currentYear={currentYear} />
          ))}
        </ul>
      ) : (
        <PlansCalendar plans={plans} currentYear={currentYear} />
      )}
      {settingsPanel}
    </main>
  );
}

/** 最近打开的排最前；打开时间相同的按 plan_id 排，顺序固定。 */
function byLastOpened<T extends { plan_id: string; last_opened_at: string | null }>(plans: T[]): T[] {
  const compare = (x: string, y: string) => (x < y ? -1 : x > y ? 1 : 0);
  return plans.sort(
    (a, b) => compare(b.last_opened_at ?? "", a.last_opened_at ?? "") || compare(a.plan_id, b.plan_id),
  );
}
