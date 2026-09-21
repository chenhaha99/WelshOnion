import { markUsed } from "../help/help-usage";
import type { LibraryView, PlanView } from "@welshonion/core";
import { Fragment, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Menu } from "../app/Menu";
import { navigate, planHref } from "../app/route";
import { useLibrary, useNow, useTimeZone } from "../app/services";
import { todayIn } from "../plan/day-labels";
import { deletePlan, duplicatePlan } from "../storage/plans";
import { planSummaryLine, type PlanSummaryFields } from "./format";
import { PlanThumb } from "./PlanThumb";
import { isSamplePlan } from "./sample-plan";

interface CardPlan extends PlanSummaryFields {
  plan_id: string;
  name: string;
}

type Mode = "normal" | "confirm-delete" | "duplicate";

interface PlanCardProps {
  plan: CardPlan;
  currentYear: number;
  /** 计划的内容（画迷你时间线）；还没读出来是 undefined，先画个空框 */
  preview: PlanView | undefined;
  libraryView: LibraryView;
  /**
   * 最上面那张「下一趟」（照 Apple Invites 的「下一个活动」倒计时）：卡片放大，标签写「下一趟」或「正在进行」，
   * 名字下面多几行（「还有 11 天出发」「下一件 14:00 灵隐寺」）。别的和普通卡片一样，也有「⋯」
   */
  featured?: { label: string; lines: string[] };
}

export function PlanCard({ plan, currentYear, preview, libraryView, featured }: PlanCardProps) {
  const library = useLibrary();
  const [mode, setMode] = useState<Mode>("normal");
  const [deleting, setDeleting] = useState(false);

  // 取消后焦点回到「⋯」，键盘用户不会丢位置
  const card = useRef<HTMLLIElement>(null);
  const previousMode = useRef<Mode>("normal");
  useEffect(() => {
    if (mode === "normal" && previousMode.current !== "normal") moreButton(card.current)?.focus();
    previousMode.current = mode;
  }, [mode]);

  const title = (
    <div className="flex min-w-0 items-center gap-2">
      <h3 className={`truncate font-medium text-ink ${featured ? "text-2xl" : "text-lg"}`}>{plan.name}</h3>
      {/* 示例计划挂个角标：一眼看出这趟不是你自己排的 */}
      {isSamplePlan(plan) && <span className="sample-badge">示例</span>}
    </div>
  );
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
    <li
      ref={card}
      className={`plan-card glass-card glass-card-hover relative${featured ? " is-featured" : ""}`}
      // 手机上长按卡片、电脑上右键：弹出和「⋯」同一个菜单（照备忘录、Final Cut Pro 长按出菜单）
      onContextMenu={(event) => {
        event.preventDefault();
        markUsed("card-menu");
        moreButton(card.current)?.click();
      }}
    >
      <div className="plan-card-thumb">{preview && <PlanThumb plan={preview} library={libraryView} />}</div>
      <a
        href={planHref(plan.plan_id)}
        className="flex min-w-0 flex-1 flex-col gap-1 rounded-sm after:absolute after:inset-0 after:rounded-2xl"
      >
        {featured && <p className="text-sm font-medium text-sage-deep">{featured.label}</p>}
        {title}
        {featured?.lines.map((line, index) => (
          <p key={index} className={index === 0 ? "text-lg text-ink" : "text-ink-muted"}>
            {line}
          </p>
        ))}
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
      {/* 复制、删除收在「⋯」里（照 iMovie Mac 项目名旁的「⋯」、Final Cut Pro 长按）：删除不该一伸手就点到 */}
      <div className="relative z-10 self-start">
        <Menu
          label={`「${plan.name}」的操作`}
          triggerClassName="btn btn-ghost btn-icon"
          items={[
            { label: "复制…", onSelect: () => setMode("duplicate") },
            { label: "删除…", danger: true, onSelect: () => setMode("confirm-delete") },
          ]}
        >
          <MoreIcon />
        </Menu>
      </div>
    </li>
  );
}

/** 卡片上「⋯」那个按钮 */
function moreButton(card: HTMLElement | null): HTMLButtonElement | null {
  return card?.querySelector<HTMLButtonElement>('button[aria-haspopup="menu"]') ?? null;
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden fill="currentColor">
      <circle cx="4.5" cy="10" r="1.6" />
      <circle cx="10" cy="10" r="1.6" />
      <circle cx="15.5" cy="10" r="1.6" />
    </svg>
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
