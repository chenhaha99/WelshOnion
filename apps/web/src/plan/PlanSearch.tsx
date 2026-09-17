import { passesFilter, type PlanView, type StatsFilter } from "@welshonion/core";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { AnchoredCard } from "../app/AnchoredCard";
import { searchPlan } from "./plan-search";

interface PlanSearchProps {
  plan: PlanView;
  /** 现在的筛选：被它挡住的结果写「筛掉了」 */
  filter: StatsFilter | undefined;
  /** 页顶的「搜索」按钮 */
  anchor: HTMLElement;
  /** Esc、「关闭」、点外面：外面把焦点放回「搜索」按钮 */
  onClose: () => void;
  /** 点了一条结果：外面关掉面板、跳到那件事 */
  onPick: (blockId: string) => void;
}

/**
 * 计划内搜索面板：贴着页顶的「搜索」弹出（手机上占满屏幕，见 AnchoredCard）。
 * 打开时焦点在搜索框；输入框里按 ↓ 进结果，结果上 ↑↓ 移动、第一条上按 ↑ 回搜索框，Enter 或点击跳过去。
 * 搜索词不记住：每次打开都是新的面板。
 */
export function PlanSearch({ plan, filter, anchor, onClose, onPick }: PlanSearchProps) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchPlan(plan, query), [plan, query]);
  const box = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const resultButtons = () => [...list.current!.querySelectorAll<HTMLButtonElement>("button")];

  const moveInResults = (event: KeyboardEvent<HTMLUListElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const buttons = resultButtons();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === "ArrowUp" && at === 0) box.current!.focus();
    else if (event.key === "ArrowUp") buttons[at - 1]!.focus();
    else buttons[Math.min(at + 1, buttons.length - 1)]!.focus();
  };

  return (
    <AnchoredCard anchor={anchor} title="搜索" estimatedHeight={320} onClose={onClose}>
      <input
        ref={box}
        type="search"
        aria-label="搜索这趟计划"
        placeholder="标题、备注、开销说明"
        className="input w-full"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" || hits.length === 0) return;
          event.preventDefault();
          resultButtons()[0]!.focus();
        }}
      />
      {query.trim() !== "" &&
        (hits.length === 0 ? (
          <p className="text-sm text-ink-muted">没找到</p>
        ) : (
          <>
            <p className="text-sm text-ink-muted">{`找到 ${hits.length} 件`}</p>
            <ul ref={list} aria-label="搜索结果" className="-mx-2 flex flex-col" onKeyDown={moveInResults}>
              {hits.map((hit) => (
                <li key={hit.block.id}>
                  <button
                    type="button"
                    className="w-full rounded-lg px-2 py-1.5 text-left hover:bg-sage/10 focus-visible:outline-2 focus-visible:outline-sage"
                    onClick={() => onPick(hit.block.id)}
                  >
                    <span className="block truncate text-sm text-ink">{hit.block.title}</span>
                    <span className="block truncate text-xs text-ink-muted tabular-nums">
                      {passesFilter(hit.block, filter) ? hit.where : `${hit.where} · 筛掉了`}
                    </span>
                    {hit.snippet && (
                      <span className="block truncate text-xs text-ink-muted">{`${hit.snippet.label}：${hit.snippet.text}`}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        ))}
    </AnchoredCard>
  );
}
