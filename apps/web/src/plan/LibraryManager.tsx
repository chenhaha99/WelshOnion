import { useEffect, useRef, useState } from "react";
import { CreateForm, DeleteConfirm, LayerChoices, RenameForm, Swatches, type LibraryItem } from "./library-forms";
import type { PickerActions } from "./LibraryPicker";

/** 管理这一半的动作：选一个不算（设置里不选） */
export type ManageActions = Omit<PickerActions, "onChoose">;

interface LibraryManagerProps {
  /** 「类型」 */
  label: string;
  options: LibraryItem[];
  actions: ManageActions;
}

type Mode = { kind: "list" } | { kind: "create" } | { kind: "rename" | "recolor" | "relayer" | "delete"; id: string };

/**
 * 计划设置里的「类型」：一项一行，写着这个计划里有几件在用，能改名、改颜色、改层、删除（只有自建的），
 * 末尾「+ 新建」。改的是资料库，所有计划共用（这句话由外面的设置写）。
 */
export function LibraryManager({ label, options, actions }: LibraryManagerProps) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const backToList = () => setMode({ kind: "list" });
  const editing = (id: string) => (mode.kind === "list" || mode.kind === "create" || mode.id !== id ? null : mode.kind);

  // 展开的小表单收起时，里面有焦点的元素跟着没了（删完连那一行都没了）：把焦点放回这一块里，
  // 优先放回改的那一项，免得焦点掉到页面上、键盘用户找不回来
  const root = useRef<HTMLDivElement>(null);
  const edited = useRef<string | null>(null);
  const previous = useRef(mode.kind);
  useEffect(() => {
    if (mode.kind === "list" && previous.current !== "list") {
      const box = root.current;
      const row = edited.current === null ? null : box?.querySelector<HTMLElement>(`[data-item="${edited.current}"] button`);
      (row ?? box?.querySelector<HTMLElement>("button:not(:disabled)"))?.focus();
    }
    previous.current = mode.kind;
  }, [mode.kind]);
  const open = (kind: "rename" | "recolor" | "relayer" | "delete", id: string) => {
    edited.current = id;
    setMode({ kind, id });
  };

  return (
    <div ref={root} role="group" aria-label={`${label}的管理`} className="flex flex-col gap-1 text-sm">
      {options.map((option) => {
        const usage = actions.countUsing(option.id);
        return (
          <div key={option.id} data-item={option.id} className="flex flex-col">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg px-1 py-1 hover:bg-white/60">
              <span className="kind-dot" aria-hidden style={{ backgroundColor: option.color }} />
              <span className="min-w-16 flex-1 text-ink">{option.name}</span>
              <span className="text-xs text-ink-muted">{usage > 0 ? `这个计划里 ${usage} 件在用` : "没有在用的"}</span>
              <div className="flex items-center">
                <button
                  type="button"
                  aria-label={`改名：${option.name}`}
                  className="btn btn-ghost h-7 px-2"
                  onClick={() => open("rename", option.id)}
                >
                  改名
                </button>
                <button
                  type="button"
                  aria-label={`改颜色：${option.name}`}
                  className="btn btn-ghost h-7 px-2"
                  onClick={() => open("recolor", option.id)}
                >
                  改颜色
                </button>
                <button
                  type="button"
                  aria-label={`改层：${option.name}`}
                  className="btn btn-ghost h-7 px-2"
                  onClick={() => open("relayer", option.id)}
                >
                  改层
                </button>
                {/* 预设的永远删不了：不摆一个灰的，免得让人去试 */}
                {!option.builtin && (
                  <button
                    type="button"
                    aria-label={`删除：${option.name}`}
                    className="btn btn-ghost h-7 px-2 text-danger"
                    onClick={() => open("delete", option.id)}
                  >
                    删除
                  </button>
                )}
              </div>
            </div>
            {editing(option.id) === "rename" && (
              <RenameForm
                name={option.name}
                onSave={(name) => {
                  if (name !== option.name) actions.onRename(option.id, name);
                  backToList();
                }}
                onCancel={backToList}
              />
            )}
            {editing(option.id) === "recolor" && (
              <Swatches
                chosen={option.color}
                onPick={(color) => {
                  if (color !== option.color) actions.onRecolor(option.id, color);
                  backToList();
                }}
              />
            )}
            {editing(option.id) === "relayer" && (
              <LayerChoices
                options={options}
                onPick={(layer) => {
                  if (layer !== option.layer) actions.onRelayer(option.id, layer);
                  backToList();
                }}
              />
            )}
            {editing(option.id) === "delete" && (
              <DeleteConfirm
                label={label}
                usage={usage}
                onConfirm={() => {
                  actions.onDelete(option.id);
                  backToList();
                }}
                onCancel={backToList}
              />
            )}
          </div>
        );
      })}

      {mode.kind === "create" ? (
        <CreateForm
          label={label}
          onCreate={(input) => {
            if (actions.onCreate(input) !== null) backToList();
          }}
          onCancel={backToList}
        />
      ) : (
        <button type="button" className="btn btn-ghost h-8 self-start px-2 text-sage-deep" onClick={() => setMode({ kind: "create" })}>
          + 新建{label}
        </button>
      )}
    </div>
  );
}
