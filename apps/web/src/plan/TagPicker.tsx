import { addTag, setBlockTag, type BlockView, type TagView } from "@welshonion/core";
import { useRef, useState } from "react";
import type * as Y from "yjs";
import { Popover } from "../app/Popover";
import { TagIcon } from "./icons";
import { CreateForm, firstUnusedColor, Reveal } from "./library-forms";
import { TagRibbon } from "./tag-ribbon";

const OPTION_HEIGHT_PX = 36;

interface TagPickerProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  /** 资料库里全部标签，按顺序 */
  tags: TagView[];
  /** 快捷条上只画一个吊牌，名字只在读屏名和提示里 */
  compact?: boolean;
}

/**
 * 一件事挂哪几个标签：按钮写着挂着的（快捷条上是图标）；点开是资料库里全部标签，一项一个开关，
 * 点一下挂上或摘下、面板不关（多选）；最后「+ 新建标签」，建好直接挂上。改名、改颜色、删除在计划设置里。
 */
export function TagPicker({ doc, library, block, tags, compact = false }: TagPickerProps) {
  const names = block.tags.map((tag) => tag.name).join("、");
  const label = `标签：${names === "" ? "没有" : names}`;
  return (
    <Popover
      label={label}
      triggerTitle={compact ? label : undefined}
      trigger={compact ? <TagIcon /> : <TagNames tags={block.tags} />}
      triggerClassName={compact ? "quick-button" : "input-bare flex min-w-0 items-center gap-1.5 overflow-hidden text-left text-sm"}
      role="dialog"
      panelLabel="选择标签"
      panelClassName="menu w-64"
      align="start"
      estimatedHeight={tags.length * OPTION_HEIGHT_PX + 90}
    >
      {() => <TagPanel doc={doc} library={library} block={block} tags={tags} />}
    </Popover>
  );
}

/** 列表里按钮上的字：一排书签，后面是名字（写不下截断加「…」）；一个没挂淡色写「加标签」。 */
function TagNames({ tags }: { tags: readonly TagView[] }) {
  if (tags.length === 0) return <span className="text-ink-muted/60">加标签</span>;
  return (
    <>
      <span aria-hidden className="flex shrink-0 items-center gap-0.5">
        {tags.map((tag) => (
          <TagRibbon key={tag.id} color={tag.color} />
        ))}
      </span>
      <span className="min-w-0 truncate">{tags.map((tag) => tag.name).join("、")}</span>
    </>
  );
}

interface TagPanelProps {
  doc: Y.Doc;
  library: Y.Doc;
  block: BlockView;
  tags: TagView[];
}

function TagPanel({ doc, library, block, tags }: TagPanelProps) {
  const [creating, setCreating] = useState(false);
  const createButton = useRef<HTMLButtonElement>(null);
  const attached = new Set(block.tag_ids);

  return (
    <div className="flex flex-col">
      {tags.map((tag) => {
        const on = attached.has(tag.id);
        return (
          <button
            key={tag.id}
            type="button"
            data-tag-option={tag.id}
            aria-pressed={on}
            className="menu-item flex items-center gap-2"
            onClick={() => setBlockTag(doc, library, [block.id], tag.id, !on)}
          >
            <TagRibbon color={tag.color} />
            <span className="flex-1 text-left">{tag.name}</span>
            {on && (
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
            label="标签"
            initialColor={firstUnusedColor(tags)}
            onCreate={(input) => {
              const result = addTag(library, input);
              if (!result.ok) return;
              const tagId = result.value.tagId;
              setBlockTag(doc, library, [block.id], tagId, true);
              setCreating(false);
              // 表单收起时焦点跟着没了：放到刚建的那一项上，接着能挂别的
              requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-tag-option="${tagId}"]`)?.focus());
            }}
            onCancel={() => {
              setCreating(false);
              // 表单收起时焦点跟着没了：回到「+ 新建标签」
              requestAnimationFrame(() => createButton.current?.focus());
            }}
          />
        </Reveal>
      ) : (
        <button ref={createButton} type="button" className="menu-item text-sage-deep" onClick={() => setCreating(true)}>
          + 新建标签
        </button>
      )}
      <p className="border-t border-ink/10 px-3 py-2 text-xs text-ink-muted">改名、改颜色、删除在计划设置里</p>
    </div>
  );
}
