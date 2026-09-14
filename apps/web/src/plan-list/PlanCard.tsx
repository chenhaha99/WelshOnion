import { useEffect, useRef, useState } from "react";
import { planHref } from "../app/route";
import { useLibrary } from "../app/services";
import { deletePlan } from "../storage/plans";
import { planSummaryLine, type PlanSummaryFields } from "./format";

interface CardPlan extends PlanSummaryFields {
  plan_id: string;
  name: string;
}

export function PlanCard({ plan, currentYear }: { plan: CardPlan; currentYear: number }) {
  const library = useLibrary();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 取消确认后，焦点回到「删除」按钮，键盘用户不会丢位置
  const deleteButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);
  useEffect(() => {
    if (!confirming && wasConfirming.current) deleteButton.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  const title = <h2 className="truncate text-lg font-medium text-ink">{plan.name}</h2>;

  if (confirming) {
    return (
      <li
        className="glass-card flex flex-wrap items-center gap-4 p-5"
        onKeyDown={(event) => {
          if (event.key === "Escape") setConfirming(false);
        }}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title}
          <p className="text-sm text-danger">删除这个计划？删了找不回来。</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn btn-danger"
            disabled={deleting}
            onClick={async () => {
              setDeleting(true);
              await deletePlan(library, plan.plan_id);
            }}
          >
            确认删除
          </button>
          <button type="button" className="btn btn-ghost" autoFocus onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      </li>
    );
  }

  return (
    <li className="glass-card glass-card-hover relative flex items-center gap-4 p-5">
      <a
        href={planHref(plan.plan_id)}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm after:absolute after:inset-0 after:rounded-2xl"
      >
        {title}
        <p className="text-sm text-ink-muted tabular-nums">{planSummaryLine(plan, currentYear)}</p>
      </a>
      <button
        ref={deleteButton}
        type="button"
        className="btn btn-ghost relative z-10"
        onClick={() => setConfirming(true)}
      >
        删除
      </button>
    </li>
  );
}
