interface FilterChipsProps {
  /** 这一排的读屏名：「按类型筛选」 */
  label: string;
  /** 前面写的字：「类型」 */
  lead: string;
  /** 有按下的时，末尾清空按钮的字：「全部类型」 */
  clearLabel: string;
  items: ReadonlyArray<{ id: string; name: string; color: string }>;
  /** 按下的 id */
  selected: readonly string[];
  onChange: (next: string[]) => void;
}

/** 切换视图的按钮上面的一排筛选按钮：可以同时按下几个，都不按就是全都看；有按下时末尾一个清空按钮。 */
export function FilterChips({ label, lead, clearLabel, items, selected, onChange }: FilterChipsProps) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-ink-muted">{lead}</span>
      {items.map((item) => {
        const pressed = selected.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={pressed}
            className={chipClass(pressed)}
            onClick={() => onChange(pressed ? selected.filter((id) => id !== item.id) : [...selected, item.id])}
          >
            <span aria-hidden="true" className="kind-dot" style={{ backgroundColor: item.color }} />
            {item.name}
          </button>
        );
      })}
      {selected.length > 0 && (
        <button type="button" className="btn btn-ghost h-8 px-2" onClick={() => onChange([])}>
          {clearLabel}
        </button>
      )}
    </div>
  );
}

/** 筛选、分组这类圆角按钮的样子：按下的有底色。 */
export function chipClass(pressed: boolean): string {
  return `inline-flex h-8 items-center gap-1.5 rounded-full border px-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sage ${
    pressed ? "border-sage bg-sage/15 text-ink" : "border-ink/10 bg-white/70 text-ink-muted hover:text-ink"
  }`;
}
