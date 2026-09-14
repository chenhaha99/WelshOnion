import { DocumentError, readLibrary, readPlan, summarizePlan, touchPlan } from "@welshonion/core";
import { useEffect, useMemo, useRef, useState } from "react";
import { BackToList, LateNotice, Notice } from "../app/Notice";
import { useLibrary, useNow } from "../app/services";
import { useDocVersion } from "../app/use-doc-version";
import { openPlan, type PlanHandle } from "../storage/plans";
import { AskDays } from "./AskDays";
import { DayList } from "./DayList";
import { SettingsDrawer } from "./SettingsDrawer";
import { usePlanUndo } from "./use-plan-undo";

type PlanState = { status: "opening" } | { status: "open"; handle: PlanHandle } | { status: "missing" };

export function PlanPage({ planId }: { planId: string }) {
  const library = useLibrary();
  const now = useNow();
  const [state, setState] = useState<PlanState>({ status: "opening" });

  useEffect(() => {
    // 严格模式下开发时会进两次：先作废的那次，打开结果直接关掉
    let cancelled = false;
    let opened: PlanHandle | null = null;
    openPlan(library, planId, now()).then(
      (handle) => {
        if (cancelled) {
          void handle.close();
          return;
        }
        opened = handle;
        setState({ status: "open", handle });
      },
      (error: unknown) => {
        if (cancelled) return;
        if (error instanceof DocumentError && error.code === "NOT_INITIALIZED") {
          setState({ status: "missing" });
        } else {
          setState(() => {
            throw error;
          });
        }
      },
    );
    return () => {
      cancelled = true;
      void opened?.close();
    };
  }, [library, planId, now]);

  // 打开后索引里这条没了，说明别的标签页把它删了
  const libraryVersion = useDocVersion(library);
  const indexed = useMemo(() => readLibrary(library).planIndex.has(planId), [library, libraryVersion, planId]);

  if (state.status === "opening") return <LateNotice>正在打开…</LateNotice>;
  if (state.status === "missing") return <Notice title="找不到这个计划" />;
  if (!indexed) return <Notice title="这个计划已经删除了">可能是在别的标签页里删的。</Notice>;
  return <OpenPlan handle={state.handle} />;
}

function OpenPlan({ handle }: { handle: PlanHandle }) {
  const library = useLibrary();
  const now = useNow();
  const libraryVersion = useDocVersion(library);
  const planVersion = useDocVersion(handle.doc);
  const libraryView = useMemo(() => readLibrary(library), [library, libraryVersion]);
  const plan = useMemo(() => readPlan(handle.doc, libraryView), [handle.doc, libraryView, planVersion]);
  const undo = usePlanUndo(handle.doc);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const titleButton = useRef<HTMLButtonElement>(null);

  // 摘要和索引对不上就刷新索引，回到列表（包括别的标签页开着的列表）看到的卡片是新的
  useEffect(() => {
    const entry = readLibrary(library).planIndex.get(handle.planId);
    // 索引里没了是被别的标签页删了：外层会显示提示，这里不能把它写回来
    if (!entry) return;
    const summary = summarizePlan(plan);
    const stale =
      entry.name !== summary.name ||
      entry.traveler_count !== summary.traveler_count ||
      entry.date_start !== summary.date_start ||
      entry.date_end !== summary.date_end ||
      entry.day_count !== summary.day_count;
    if (stale) touchPlan(library, handle.doc, now());
  }, [plan, library, handle, now]);

  return (
    // 放宽到 1152 像素：时间轴的 24 小时要放得下（每小时至少 30 像素）
    <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <div className="flex items-center justify-between gap-4">
        <BackToList />
        <div className="flex gap-1">
          <button type="button" className="btn btn-ghost" disabled={!undo.canUndo} onClick={undo.undo}>
            撤销
          </button>
          <button type="button" className="btn btn-ghost" disabled={!undo.canRedo} onClick={undo.redo}>
            重做
          </button>
        </div>
      </div>

      <h1 className="text-2xl font-medium text-ink">
        <button
          ref={titleButton}
          type="button"
          title="计划设置"
          className="rounded-lg text-left hover:text-sage-deep focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-sage"
          onClick={() => setSettingsOpen(true)}
        >
          {plan.plan.name}
        </button>
      </h1>

      {plan.bases.length === 0 ? (
        <AskDays doc={handle.doc} />
      ) : (
        <DayList doc={handle.doc} library={library} libraryView={libraryView} plan={plan} />
      )}

      {settingsOpen && (
        <SettingsDrawer
          doc={handle.doc}
          library={library}
          settings={plan.plan}
          onClose={() => {
            setSettingsOpen(false);
            titleButton.current?.focus();
          }}
        />
      )}
    </main>
  );
}
