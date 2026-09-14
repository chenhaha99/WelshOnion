import type { LibraryView } from "@welshonion/core";

interface StatusFilterProps {
  libraryView: LibraryView;
  /** 按下的状态 id */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** 日期列表上面「只看」一排状态按钮：可以同时按下几个，都不按就是全都看；有按下时「全部显示」一键清掉。 */
export function StatusFilter({ libraryView, selected, onChange }: StatusFilterProps) {
  const statuses = [...libraryView.statuses.values()].sort((a, b) => a.order - b.order);

  return (
    <div role="group" aria-label="按状态筛选" className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-muted">只看</span>
      {statuses.map((status) => {
        const pressed = selected.includes(status.id);
        return (
          <button
            key={status.id}
            type="button"
            aria-pressed={pressed}
            className={`inline-flex h-8 items-center gap-1.5 rounded-full border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
              pressed ? "border-sage bg-sage/15 text-ink" : "border-ink/10 bg-white/70 text-ink-muted hover:text-ink"
            }`}
            onClick={() => onChange(pressed ? selected.filter((id) => id !== status.id) : [...selected, status.id])}
          >
            <span aria-hidden="true" className="kind-dot" style={{ backgroundColor: status.color }} />
            {status.name}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={() => onChange([])}>
          全部显示
        </button>
      )}
    </div>
  );
}
