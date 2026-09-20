import {
  backfillFuel,
  countBlocksUsing,
  findFuelBackfill,
  renamePlan,
  setPlanSettings,
  shiftAllDays,
  type LibraryView,
  type PlanSettingsView,
  type PlanView,
} from "@welshonion/core";
import { useState } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { Window } from "../app/Window";
import { daysBetween } from "./day-labels";
import { LibraryManager } from "./LibraryManager";
import { parseYuan } from "./money";
import { firstUnusedColor } from "./library-forms";
import { kindLibraryActions, tagLibraryActions } from "./pickers";

/** 设置分几块，左边一列切换 */
const SECTIONS = [
  { value: "basic", label: "基本" },
  { value: "library", label: "类型" },
  { value: "tags", label: "标签" },
] as const;

type SectionName = (typeof SECTIONS)[number]["value"];

interface SettingsWindowProps {
  doc: Y.Doc;
  library: Y.Doc;
  libraryView: LibraryView;
  plan: PlanView;
  settings: PlanSettingsView;
  onClose: () => void;
}

/**
 * 计划设置窗口：左边一列分块（基本、类型、标签），右边是那一块的内容，每一栏回车或离开时保存。
 * 不常改的都收在这里（名字、人数、出发日期、每公里成本、资料库），主版面只留筛选、切换和视图本身。
 * 窗口的样子（电脑上居中、手机上占满屏幕）见 Window。
 */
export function SettingsWindow({ doc, library, libraryView, plan, settings, onClose }: SettingsWindowProps) {
  const [section, setSection] = useState<SectionName>("basic");
  // 事后才设每公里成本：问一次要不要给已有的自驾块补上油费，问的时候记下找到的块；不猜，不静默补
  const [backfillIds, setBackfillIds] = useState<string[] | null>(null);
  const firstDate = plan.bases[0]?.date ?? "";

  return (
    <Window title="计划设置" onClose={onClose}>
      <div className="flex gap-4">
        <div role="tablist" aria-orientation="vertical" aria-label="设置分区" className="flex w-24 shrink-0 flex-col gap-1">
          {SECTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={section === value}
              className={`rounded-lg px-2.5 py-2 text-left text-sm whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
                section === value ? "bg-sage/12 font-medium text-ink" : "text-ink-muted hover:text-ink"
              }`}
              onClick={() => setSection(value)}
            >
              {label}
            </button>
          ))}
        </div>

        <div
          role="tabpanel"
          aria-label={SECTIONS.find((item) => item.value === section)!.label}
          className="flex min-w-0 flex-1 flex-col gap-5"
        >
          {section === "basic" && (
            <>
              <CommitInput
                label="名字"
                value={settings.name}
                commit={(text) => {
                  // 清空不保存，恢复原名
                  if (text !== "" && text !== settings.name) renamePlan(library, doc, text);
                  return null;
                }}
              />
              <label className="flex flex-col gap-1.5 text-sm text-ink-muted">
                出发日期
                {/* 改了整趟一起平移，天数和每天的安排都不变 */}
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
              <CommitInput
                label="人数"
                value={String(settings.traveler_count)}
                inputMode="numeric"
                className="input tabular-nums"
                commit={(text) => {
                  if (!/^\d+$/.test(text) || Number(text) < 1) return "人数要是正整数";
                  const count = Number(text);
                  if (count !== settings.traveler_count && !setPlanSettings(doc, { traveler_count: count }).ok) {
                    return "人数要是正整数";
                  }
                  return null;
                }}
              />
              <CommitInput
                label="每公里成本（元）"
                value={settings.cost_per_km_cents === null ? "" : String(settings.cost_per_km_cents / 100)}
                inputMode="decimal"
                className="input tabular-nums"
                hint="油费加过路费，自驾时用；空着就不算"
                commit={(text) => {
                  const parsed = parseYuan(text);
                  if (!parsed.ok) return "要填不小于 0 的数，最多两位小数";
                  if (parsed.cents !== settings.cost_per_km_cents) {
                    const wasEmpty = settings.cost_per_km_cents === null;
                    setPlanSettings(doc, { cost_per_km_cents: parsed.cents });
                    const found = wasEmpty && parsed.cents !== null ? findFuelBackfill(doc, library) : [];
                    setBackfillIds(found.length > 0 ? found : null);
                  }
                  return null;
                }}
              />
              {/* 读屏软件会读出问句；焦点不自动挪进来，这一栏可能是点别处时保存的 */}
              <div aria-live="polite">
                {backfillIds !== null && (
                  <div role="group" aria-label="补油费" className="flex flex-wrap items-center gap-2 text-sm">
                    <p className="text-ink">{`有 ${backfillIds.length} 件事是自驾，给它们补上油费吗？`}</p>
                    <button
                      type="button"
                      className="btn btn-primary h-8 px-3"
                      onClick={() => {
                        backfillFuel(doc, library, backfillIds);
                        setBackfillIds(null);
                      }}
                    >
                      补上
                    </button>
                    <button type="button" className="btn btn-ghost h-8 px-3" onClick={() => setBackfillIds(null)}>
                      不用
                    </button>
                  </div>
                )}
              </div>
            </>
          )}

          {section === "library" && (
            <section aria-label="类型" className="flex flex-col gap-4">
              {/* 只有一套资料库：不写清楚会以为是这个计划自己的 */}
              <p className="text-xs text-ink-muted">所有计划共用；改了名字和颜色，别的计划里也跟着变</p>
              <LibraryManager
                label="类型"
                options={[...libraryView.kinds.values()].sort(byOrder)}
                actions={kindLibraryActions(library, (kindId) => countBlocksUsing(plan, { kindId }))}
              />
            </section>
          )}

          {section === "tags" && (
            <section aria-label="标签" className="flex flex-col gap-4">
              <p className="text-xs text-ink-muted">所有计划共用；改了名字和颜色，别的计划里也跟着变</p>
              <LibraryManager
                label="标签"
                marker="ribbon"
                options={[...libraryView.tags.values()].sort(byOrder).map((tag) => ({ ...tag, builtin: false }))}
                actions={tagLibraryActions(library, (tagId) => countBlocksUsing(plan, { tagId }))}
                createColor={firstUnusedColor([...libraryView.tags.values()])}
                deleteNote={(usage) =>
                  usage > 0 ? `这个计划里有 ${usage} 件事挂着，删了它们就不带这个标签了。` : "这个计划里没有事挂着。"
                }
              />
            </section>
          )}
        </div>
      </div>
    </Window>
  );
}

function byOrder(a: { order: number }, b: { order: number }): number {
  return a.order - b.order;
}
