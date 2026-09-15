import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Menu, type MenuItem } from "../app/Menu";
import { Popover } from "../app/Popover";

export interface PickerOption {
  id: string;
  name: string;
  color: string;
  builtin: boolean;
  /** 只有类型有层 */
  layer?: number;
}

export interface PickerActions {
  onChoose: (id: string) => void;
  /** 建好返回新 id，建不成返回 null */
  onCreate: (input: { name: string; color: string }) => string | null;
  onRename: (id: string, name: string) => void;
  onRecolor: (id: string, color: string) => void;
  /** 不给就没有「改层」（状态没有层） */
  onRelayer?: (id: string, layer: number) => void;
  /** 只对自建的给出删除项；预设的永远没有 */
  onDelete: (id: string) => void;
  /** 当前计划里有几个块在用 */
  countUsing: (id: string) => number;
}

interface LibraryPickerProps extends PickerActions {
  /** 「类型」或「状态」 */
  label: string;
  /** 块现在用的；指不到时 deleted 为 true */
  current: { id: string; deleted: boolean; name?: string; color?: string };
  options: PickerOption[];
}

/** 一排低饱和色块：新建和改颜色都从这里选，新建默认第一个。 */
export const SWATCHES = [
  "#77a389",
  "#6b8fb0",
  "#c08d68",
  "#9b8ab2",
  "#b0947a",
  "#8fa9bd",
  "#b98a92",
  "#9aa06b",
  "#6fa3a0",
  "#9aa3ad",
] as const;

const DELETED_COLOR = "#9aa3ad";
const OPTION_HEIGHT_PX = 36;

/**
 * 类型、状态的选择器：按钮写着现在的值；点开是资料库里的全部选项，点一项就选上并关掉。
 * 每项右边一个小菜单（改名、改颜色、改层、删除）；最后一项「+ 新建」。这些都在面板里原地展开。
 */
export function LibraryPicker({ label, current, options, ...actions }: LibraryPickerProps) {
  const currentName = current.deleted ? `已删除的${label}` : (current.name ?? "");
  const currentColor = current.deleted ? DELETED_COLOR : (current.color ?? DELETED_COLOR);

  return (
    <Popover
      label={`${label}：${currentName}`}
      trigger={
        <>
          <span className="kind-dot" aria-hidden style={{ backgroundColor: currentColor }} />
          <span className={current.deleted ? "truncate text-ink-muted" : "truncate"}>{currentName}</span>
          <span aria-hidden className="text-xs text-ink-muted">
            ▾
          </span>
        </>
      }
      triggerClassName="input-bare flex items-center gap-1.5 text-left"
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

type PanelMode =
  | { kind: "list" }
  | { kind: "create" }
  | { kind: "rename" | "recolor" | "relayer" | "delete"; id: string };

interface PickerPanelProps {
  label: string;
  current: LibraryPickerProps["current"];
  options: PickerOption[];
  actions: PickerActions;
  close: (returnFocus?: boolean) => void;
}

function PickerPanel({ label, current, options, actions, close }: PickerPanelProps) {
  const [mode, setMode] = useState<PanelMode>({ kind: "list" });
  const backToList = () => setMode({ kind: "list" });

  // 原地展开的表单收起时，里面有焦点的元素跟着没了（删除时连那一项都没了）：把焦点放回面板里，
  // 优先放在选中的那一项上，免得焦点掉到页面上、键盘用户找不回来
  const root = useRef<HTMLDivElement>(null);
  const previousMode = useRef(mode.kind);
  useEffect(() => {
    if (mode.kind === "list" && previousMode.current !== "list") {
      const panel = root.current;
      // 先挑元素再聚焦一次：focus() 没有返回值，不能拿 ?? 接着写
      (
        panel?.querySelector<HTMLElement>("[aria-pressed=true]") ??
        panel?.querySelector<HTMLElement>("button:not(:disabled)")
      )?.focus();
    }
    previousMode.current = mode.kind;
  }, [mode.kind]);

  const itemsFor = (option: PickerOption): MenuItem[] => [
    { label: "改名…", onSelect: () => setMode({ kind: "rename", id: option.id }) },
    { label: "改颜色…", onSelect: () => setMode({ kind: "recolor", id: option.id }) },
    ...(actions.onRelayer ? [{ label: "改层…", onSelect: () => setMode({ kind: "relayer", id: option.id }) }] : []),
    // 预设的永远删不了：不放灰掉的删除项，免得让人去试
    ...(option.builtin
      ? []
      : [{ label: "删除…", danger: true, onSelect: () => setMode({ kind: "delete", id: option.id }) }]),
  ];

  return (
    <div ref={root} className="flex flex-col">
      {options.map((option) => {
        const chosen = option.id === current.id && !current.deleted;
        const editing = mode.kind !== "list" && mode.kind !== "create" && mode.id === option.id ? mode.kind : null;
        return (
          <div key={option.id} className="flex flex-col">
            <div className="flex items-center">
              <button
                type="button"
                aria-pressed={chosen}
                className="menu-item flex flex-1 items-center gap-2"
                onClick={() => {
                  close(true);
                  if (!chosen) actions.onChoose(option.id);
                }}
              >
                <span className="kind-dot" aria-hidden style={{ backgroundColor: option.color }} />
                <span className="flex-1">{option.name}</span>
                {chosen && (
                  <span aria-hidden className="text-sage-deep">
                    ✓
                  </span>
                )}
              </button>
              <Menu label={`「${option.name}」的操作`} items={itemsFor(option)}>
                ⋯
              </Menu>
            </div>
            {editing === "rename" && (
              <Reveal>
                <RenameForm
                  name={option.name}
                  onSave={(name) => {
                    if (name !== option.name) actions.onRename(option.id, name);
                    backToList();
                  }}
                  onCancel={backToList}
                />
              </Reveal>
            )}
            {editing === "recolor" && (
              <Reveal>
                <Swatches
                  chosen={option.color}
                  onPick={(color) => {
                    if (color !== option.color) actions.onRecolor(option.id, color);
                    backToList();
                  }}
                />
              </Reveal>
            )}
            {editing === "relayer" && actions.onRelayer && (
              <Reveal>
                <LayerChoices
                  options={options}
                  onPick={(layer) => {
                    if (layer !== option.layer) actions.onRelayer?.(option.id, layer);
                    backToList();
                  }}
                />
              </Reveal>
            )}
            {editing === "delete" && (
              <Reveal>
                <DeleteConfirm
                  label={label}
                  usage={actions.countUsing(option.id)}
                  onConfirm={() => {
                    actions.onDelete(option.id);
                    backToList();
                  }}
                  onCancel={backToList}
                />
              </Reveal>
            )}
          </div>
        );
      })}

      {mode.kind === "create" ? (
        <Reveal>
          <CreateForm
            label={label}
            onCreate={(input) => {
              const id = actions.onCreate(input);
              if (id === null) return;
              close(true);
              actions.onChoose(id);
            }}
            onCancel={backToList}
          />
        </Reveal>
      ) : (
        <button type="button" className="menu-item text-sage-deep" onClick={() => setMode({ kind: "create" })}>
          + 新建{label}
        </button>
      )}
    </div>
  );
}

/** 面板里原地展开的东西一出现就滚进可见范围：面板有最大高度，展开在底下的按钮会被藏在滚动区外面。 */
function Reveal({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return <div ref={box}>{children}</div>;
}

/** 面板里原地展开的小表单：Esc 回到列表，不关整个选择器。 */
function stayInPicker(onCancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };
}

function RenameForm({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(name);
  const trimmed = text.trim();
  return (
    <div className="flex items-center gap-1.5 px-2 pb-2" onKeyDown={stayInPicker(onCancel)}>
      <input
        aria-label="新名字"
        autoFocus
        className="input h-8 min-w-0 flex-1"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && trimmed !== "") {
            event.preventDefault();
            onSave(trimmed);
          }
        }}
      />
      <button type="button" className="btn btn-ghost h-8 px-2" disabled={trimmed === ""} onClick={() => onSave(trimmed)}>
        确定
      </button>
    </div>
  );
}

function Swatches({ chosen, onPick }: { chosen: string; onPick: (color: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pb-2">
      {SWATCHES.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`颜色 ${color}`}
          aria-pressed={color === chosen}
          className="h-6 w-6 rounded-full border-2 border-white shadow-sm aria-pressed:outline-2 aria-pressed:outline-offset-1 aria-pressed:outline-ink"
          style={{ backgroundColor: color }}
          onClick={() => onPick(color)}
        />
      ))}
    </div>
  );
}

/** 改层的选项是现有类型用到的各层，从底到上，写明每层有哪些类型。 */
function LayerChoices({ options, onPick }: { options: PickerOption[]; onPick: (layer: number) => void }) {
  const layers = [...new Set(options.flatMap((option) => (option.layer === undefined ? [] : [option.layer])))].sort(
    (a, b) => a - b,
  );
  return (
    <div className="flex flex-col px-1 pb-2">
      {layers.map((layer) => (
        <button key={layer} type="button" className="menu-item text-sm" onClick={() => onPick(layer)}>
          第 {layer} 层（
          {options
            .filter((option) => option.layer === layer)
            .map((option) => option.name)
            .join("、")}
          ）
        </button>
      ))}
    </div>
  );
}

/** 删除前如实说只数得出这个计划里有几个块在用；资料库的写入不进撤销，所以要确认。 */
function DeleteConfirm({
  label,
  usage,
  onConfirm,
  onCancel,
}: {
  label: string;
  usage: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 px-3 pb-2 text-sm" onKeyDown={stayInPicker(onCancel)}>
      <p className="text-ink">
        {usage > 0
          ? `这个计划里有 ${usage} 件事在用，删了它们会写成「已删除的${label}」。`
          : "这个计划里没有事在用。"}
      </p>
      <div className="flex justify-end gap-1.5">
        <button type="button" className="btn btn-ghost h-8 px-3" autoFocus onClick={onCancel}>
          取消
        </button>
        <button type="button" className="btn btn-danger h-8 px-3" onClick={onConfirm}>
          删除
        </button>
      </div>
    </div>
  );
}

function CreateForm({
  label,
  onCreate,
  onCancel,
}: {
  label: string;
  onCreate: (input: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(SWATCHES[0]);
  const trimmed = name.trim();
  return (
    <div className="flex flex-col gap-2 border-t border-ink/10 px-2 pt-2 pb-1" onKeyDown={stayInPicker(onCancel)}>
      <input
        aria-label="名字"
        autoFocus
        placeholder={`新${label}的名字`}
        className="input h-8"
        value={name}
        onChange={(event) => setName(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && trimmed !== "") {
            event.preventDefault();
            onCreate({ name: trimmed, color });
          }
        }}
      />
      <Swatches chosen={color} onPick={setColor} />
      <div className="flex justify-end gap-1.5">
        <button type="button" className="btn btn-ghost h-8 px-3" onClick={onCancel}>
          取消
        </button>
        <button
          type="button"
          className="btn btn-primary h-8 px-3"
          disabled={trimmed === ""}
          onClick={() => onCreate({ name: trimmed, color })}
        >
          确定
        </button>
      </div>
    </div>
  );
}
