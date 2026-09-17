import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

/*
 * 类型用的几个小表单：改名、挑颜色、改层、删除确认、新建。
 * 两处用：安排表里的选择器（只用新建）、计划设置里的「类型」（全用）。
 */

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

/** 一项能改的东西：名字、颜色、层 */
export interface LibraryItem {
  id: string;
  name: string;
  color: string;
  builtin: boolean;
  layer: number;
}

/** 面板里原地展开的东西一出现就滚进可见范围：面板有最大高度，展开在底下的按钮会被藏在滚动区外面。 */
export function Reveal({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    box.current?.scrollIntoView({ block: "nearest" });
  }, []);
  return <div ref={box}>{children}</div>;
}

/** 面板里原地展开的小表单：Esc 回到列表，不关整个选择器。 */
export function stayInPicker(onCancel: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
    }
  };
}

export function RenameForm({ name, onSave, onCancel }: { name: string; onSave: (name: string) => void; onCancel: () => void }) {
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

export function Swatches({ chosen, onPick }: { chosen: string; onPick: (color: string) => void }) {
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
export function LayerChoices({ options, onPick }: { options: LibraryItem[]; onPick: (layer: number) => void }) {
  const layers = [...new Set(options.map((option) => option.layer))].sort((a, b) => a - b);
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
export function DeleteConfirm({
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

export function CreateForm({
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
