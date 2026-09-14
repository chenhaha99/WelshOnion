import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { navigate, planHref } from "../app/route";
import { useLibrary, useNow, useTimeZone } from "../app/services";
import { todayIn } from "../plan/day-labels";
import { deletePlan, duplicatePlan } from "../storage/plans";
import { planSummaryLine, type PlanSummaryFields } from "./format";

interface CardPlan extends PlanSummaryFields {
  plan_id: string;
  name: string;
}

type Mode = "normal" | "confirm-delete" | "duplicate";

export function PlanCard({ plan, currentYear }: { plan: CardPlan; currentYear: number }) {
  const library = useLibrary();
  const [mode, setMode] = useState<Mode>("normal");
  const [deleting, setDeleting] = useState(false);

  // 取消后焦点回到点开这一步的按钮，键盘用户不会丢位置
  const deleteButton = useRef<HTMLButtonElement>(null);
  const duplicateButton = useRef<HTMLButtonElement>(null);
  const previousMode = useRef<Mode>("normal");
  useEffect(() => {
    if (mode === "normal" && previousMode.current === "confirm-delete") deleteButton.current?.focus();
    if (mode === "normal" && previousMode.current === "duplicate") duplicateButton.current?.focus();
    previousMode.current = mode;
  }, [mode]);

  const title = <h2 className="truncate text-lg font-medium text-ink">{plan.name}</h2>;
  const backToNormal = () => setMode("normal");

  if (mode === "confirm-delete") {
    return (
      <li
        className="glass-card flex flex-wrap items-center gap-4 p-5"
        onKeyDown={(event) => {
          if (event.key === "Escape") backToNormal();
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
          <button type="button" className="btn btn-ghost" autoFocus onClick={backToNormal}>
            取消
          </button>
        </div>
      </li>
    );
  }

  if (mode === "duplicate") {
    return <DuplicateForm plan={plan} title={title} onCancel={backToNormal} />;
  }

  return (
    <li className="glass-card glass-card-hover relative flex items-center gap-4 p-5">
      <a
        href={planHref(plan.plan_id)}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm after:absolute after:inset-0 after:rounded-2xl"
      >
        {title}
        {/* 手机上一行放不下时只在「 · 」处换行，「1 人」这样的一项不拆开 */}
        <p className="text-sm text-ink-muted tabular-nums">
          {planSummaryLine(plan, currentYear)
            .split(" · ")
            .map((part, index) => (
              <Fragment key={index}>
                {index > 0 && " · "}
                <span className="whitespace-nowrap">{part}</span>
              </Fragment>
            ))}
        </p>
      </a>
      <div className="relative z-10 flex gap-1">
        <button ref={duplicateButton} type="button" className="btn btn-ghost" onClick={() => setMode("duplicate")}>
          复制
        </button>
        <button ref={deleteButton} type="button" className="btn btn-ghost" onClick={() => setMode("confirm-delete")}>
          删除
        </button>
      </div>
    </li>
  );
}

interface DuplicateFormProps {
  plan: CardPlan;
  title: ReactNode;
  onCancel: () => void;
}

/** 卡片上问名字和新的出发日期（计划还没有天就不问日期），复制完直接进入新计划，和新建一样。 */
function DuplicateForm({ plan, title, onCancel }: DuplicateFormProps) {
  const library = useLibrary();
  const now = useNow();
  const timeZone = useTimeZone();
  const hasDays = plan.date_start !== null;
  const [name, setName] = useState(`${plan.name} 副本`);
  const [startDate, setStartDate] = useState(() => todayIn(now(), timeZone));
  const [copying, setCopying] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (copying || (hasDays && startDate === "")) return;
    setCopying(true);
    try {
      const trimmed = name.trim();
      const copy = await duplicatePlan(library, plan.plan_id, {
        name: trimmed === "" ? "未命名计划" : trimmed,
        ...(hasDays ? { startDate } : {}),
        now: now(),
      });
      navigate(planHref(copy.planId));
      void copy.close();
    } catch (error) {
      setCopying(() => {
        throw error;
      });
    }
  };

  return (
    <li
      className="glass-card flex flex-col gap-3 p-5"
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      {title}
      <form className="flex flex-wrap items-end gap-3" onSubmit={submit}>
        <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
          名字
          <input className="input w-56 max-w-full" autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        {hasDays && (
          <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
            新的出发日期
            <input
              type="date"
              required
              className="input"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
        )}
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={copying}>
            复制
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
        </div>
      </form>
    </li>
  );
}
