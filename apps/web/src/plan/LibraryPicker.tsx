import { useState } from "react";
import { Popover } from "../app/Popover";
import { CreateForm, Reveal, type LibraryItem } from "./library-forms";

export type PickerOption = LibraryItem;

/** 资料库那一半的动作：选择器只用 onChoose 和 onCreate，设置里的管理用其余几个。 */
export interface PickerActions {
  onChoose: (id: string) => void;
  /** 建好返回新 id，建不成返回 null */
  onCreate: (input: { name: string; color: string }) => string | null;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  onRelayer: (id: string, layer: number) => void;
  onDelete: (id: string) => void;
  /** 当前计划里有几个块在用 */
  countUsing: (id: string) => number;
}

interface LibraryPickerProps extends PickerActions {
  /** 「类型」 */
  label: string;
  /** 块现在用的；指不到时 deleted 为 true */
  current: { id: string; deleted: boolean; name?: string; color?: string };
  options: PickerOption[];
  /** 快捷条上的样子：只画一个实心点，名字只在读屏名和提示里 */
  compact?: boolean;
}

const DELETED_COLOR = "#9aa3ad";
const OPTION_HEIGHT_PX = 36;

/**
 * 类型的选择器：按钮写着现在的值；点开是资料库里的全部选项，点一项就选上并关掉。
 * 每项右边一个小菜单（改名、改颜色、改层、删除）；最后一项「+ 新建」。这些都在面板里原地展开。
 */
export function LibraryPicker({ label, current, options, compact, ...actions }: LibraryPickerProps) {
  const currentName = current.deleted ? `已删除的${label}` : (current.name ?? "");
  const currentColor = current.deleted ? DELETED_COLOR : (current.color ?? DELETED_COLOR);

  return (
    <Popover
      label={`${label}：${currentName}`}
      triggerTitle={compact ? `${label}：${currentName}` : undefined}
      trigger={
        compact ? (
          <span className="kind-dot" aria-hidden style={{ backgroundColor: currentColor }} />
        ) : (
          <>
            <span className="kind-dot" aria-hidden style={{ backgroundColor: currentColor }} />
            <span className={current.deleted ? "truncate text-ink-muted" : "truncate"}>{currentName}</span>
            <span aria-hidden className="text-xs text-ink-muted">
              ▾
            </span>
          </>
        )
      }
      triggerClassName={compact ? "quick-button" : "input-bare flex items-center gap-1.5 text-left"}
      role="dialog"
      panelLabel={`选择${label}`}
      panelClassName="menu w-64"
      align="start"
      estimatedHeight={options.length * OPTION_HEIGHT_PX + 56}
      initialFocus={(panel) => panel.querySelector<HTMLElement>("[aria-pressed=true]")}
    >
      {(close) => <PickerPanel label={label} current={current} options={options} actions={actions} close={close} />}
    </Popover>
  );
}

interface PickerPanelProps {
  label: string;
  current: LibraryPickerProps["current"];
  options: PickerOption[];
  actions: PickerActions;
  close: (returnFocus?: boolean) => void;
}

/** 选择器面板：全部选项 + 「+ 新建」。改名、改颜色、改层、删除都在计划设置里。 */
function PickerPanel({ label, current, options, actions, close }: PickerPanelProps) {
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col">
      {options.map((option) => {
        const chosen = option.id === current.id && !current.deleted;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={chosen}
            className="menu-item flex items-center gap-2"
            onClick={() => {
              close(true);
              if (!chosen) actions.onChoose(option.id);
            }}
          >
            <span className="kind-dot" aria-hidden style={{ backgroundColor: option.color }} />
            <span className="flex-1 text-left">{option.name}</span>
            {chosen && (
              <span aria-hidden className="text-sage-deep">
                ✓
              </span>
            )}
          </button>
        );
      })}

      {creating ? (
        <Reveal>
          <CreateForm
            label={label}
            onCreate={(input) => {
              const id = actions.onCreate(input);
              if (id === null) return;
              close(true);
              actions.onChoose(id);
            }}
            onCancel={() => setCreating(false)}
          />
        </Reveal>
      ) : (
        <button type="button" className="menu-item text-sage-deep" onClick={() => setCreating(true)}>
          + 新建{label}
        </button>
      )}
      {/* 管理搬到了设置里：第一次找不到的人有个指路 */}
      <p className="border-t border-ink/10 px-3 py-2 text-xs text-ink-muted">改名、改颜色、删除在计划设置里</p>
    </div>
  );
}
