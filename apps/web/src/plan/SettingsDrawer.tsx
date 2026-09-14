import { renamePlan, setPlanSettings, type DayBudget, type PlanSettingsView } from "@welshonion/core";
import { useEffect, useRef } from "react";
import type * as Y from "yjs";
import { CommitInput } from "../app/CommitInput";
import { BudgetFields } from "./BudgetFields";
import { parseYuan } from "./money";

interface SettingsDrawerProps {
  doc: Y.Doc;
  library: Y.Doc;
  settings: PlanSettingsView;
  onClose: () => void;
}

/** 计划设置：从右边滑出，不盖住后面的内容。每一栏回车或离开时保存。 */
export function SettingsDrawer({ doc, library, settings, onClose }: SettingsDrawerProps) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    panel.current?.querySelector("input")?.focus();
  }, []);

  return (
    <aside
      ref={panel}
      role="dialog"
      aria-label="计划设置"
      className="drawer fixed top-0 right-0 z-30 flex h-full w-80 max-w-full flex-col gap-5 overflow-y-auto p-6"
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
      }}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-lg font-medium text-ink">计划设置</h2>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          关闭
        </button>
      </header>

      <CommitInput
        label="名字"
        value={settings.name}
        commit={(text) => {
          // 清空不保存，恢复原名
          if (text !== "" && text !== settings.name) renamePlan(library, doc, text);
          return null;
        }}
      />
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
          if (parsed.cents !== settings.cost_per_km_cents) setPlanSettings(doc, { cost_per_km_cents: parsed.cents });
          return null;
        }}
      />

      <section aria-label="每天的时间预算" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium text-ink">每天的时间预算</h3>
          <p className="text-xs text-ink-muted">空着就不设；每天还能在这天的菜单里单独改</p>
        </div>
        <BudgetFields
          budget={settings.default_day_budget as DayBudget | null}
          save={(next) => setPlanSettings(doc, { default_day_budget: next })}
        />
      </section>
    </aside>
  );
}
