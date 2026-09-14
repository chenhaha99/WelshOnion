import { DocumentError, readLibrary, readPlan } from "@welshonion/core";
import { useEffect, useMemo, useState } from "react";
import { BackToList, LateNotice, Notice } from "../app/Notice";
import { useLibrary, useNow } from "../app/services";
import { useDocVersion } from "../app/use-doc-version";
import { openPlan, type PlanHandle } from "../storage/plans";

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
  const libraryVersion = useDocVersion(library);
  const planVersion = useDocVersion(handle.doc);
  const plan = useMemo(
    () => readPlan(handle.doc, readLibrary(library)),
    [handle.doc, library, libraryVersion, planVersion],
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-8">
      <BackToList />
      <h1 className="text-2xl font-medium text-ink">{plan.plan.name}</h1>
      <p className="text-ink-muted">日程编辑还在做。</p>
    </main>
  );
}
