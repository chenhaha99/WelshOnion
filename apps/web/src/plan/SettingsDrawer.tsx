import { renamePlan, setPlanSettings, type PlanSettingsView } from "@welshonion/core";
import { useEffect, useId, useRef, useState } from "react";
import type * as Y from "yjs";

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
      className="drawer fixed top-0 right-0 z-30 flex h-full w-80 max-w-full flex-col gap-5 p-6"
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
        hint="油费加过路费，自驾时用；空着就不算"
        commit={(text) => {
          if (text !== "" && !/^\d+(\.\d{1,2})?$/.test(text)) return "要填不小于 0 的数，最多两位小数";
          const cents = text === "" ? null : Math.round(Number(text) * 100);
          if (cents !== settings.cost_per_km_cents) setPlanSettings(doc, { cost_per_km_cents: cents });
          return null;
        }}
      />
    </aside>
  );
}

interface CommitInputProps {
  label: string;
  /** 文档里现在存的值 */
  value: string;
  /** 保存（或决定不保存）；返回要显示的错误，没错给 null */
  commit: (text: string) => string | null;
  inputMode?: "text" | "numeric" | "decimal";
  hint?: string;
}

function CommitInput({ label, value, commit, inputMode = "text", hint }: CommitInputProps) {
  const id = useId();
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 没在改的时候跟着文档走（撤销、别的标签页改了都会变）
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  const submit = () => {
    const message = commit(text.trim());
    setError(message);
    // 出错时留着用户填的字，方便改；保存了就回到跟着文档走
    if (message === null) setEditing(false);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        className="input tabular-nums"
        inputMode={inputMode}
        value={text}
        aria-invalid={error !== null}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => {
          setEditing(true);
          setText(event.target.value);
        }}
        onBlur={() => {
          if (editing) submit();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submit();
          }
        }}
      />
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="text-xs text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
