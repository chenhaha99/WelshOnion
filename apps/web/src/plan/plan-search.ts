import type { BlockView, PlanView } from "@welshonion/core";
import { blockTimeLabel } from "./block-time";
import { blocksOfDay } from "./day-blocks";
import { dayRowLabels } from "./day-labels";
import { zoneTimeLabel } from "./zone-time";

/** 片段里命中的词前后各留几个字 */
const SNIPPET_CONTEXT = 12;

export interface SearchHit {
  block: BlockView;
  /** 在哪天、什么时间：「第 2 天 · 10.2 周五 · 09:00–12:00」，没排时间的写「没排时间」 */
  where: string;
  /** 标题里没有包含全部的词时，缺的词在备注或开销说明里命中的那一小段 */
  snippet: { label: "备注" | "开销"; text: string } | null;
}

/**
 * 计划内搜索：在每件事的标题、短备注、长备注和挂在它上面的开销说明里找，不分大小写，
 * 空格隔开的几个词都要出现（不必在同一样里）。顺序和日程视图一样：按天，每天里排了时间的在前、没排时间的在后。
 */
export function searchPlan(plan: PlanView, query: string): SearchHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
  if (words.length === 0) return [];

  const expenseTitles = new Map<string, string[]>();
  for (const expense of plan.expenses.values()) {
    for (const blockId of expense.block_ids) {
      expenseTitles.set(blockId, [...(expenseTitles.get(blockId) ?? []), expense.title]);
    }
  }

  const labels = dayRowLabels(plan.bases);
  return plan.bases.flatMap((base, index) =>
    blocksOfDay(plan, base.id).flatMap((block): SearchHit[] => {
      const others: Array<{ label: "备注" | "开销"; text: string }> = [
        ...[block.subtitle, block.note].flatMap((text) => (text === null ? [] : [{ label: "备注" as const, text }])),
        ...(expenseTitles.get(block.id) ?? []).map((text) => ({ label: "开销" as const, text })),
      ];
      const all = [block.title, ...others.map((other) => other.text)].join("\n").toLowerCase();
      if (!words.every((word) => all.includes(word))) return [];

      const time =
        block.start_minute === null ? "没排时间" : (zoneTimeLabel(plan, block) ?? blockTimeLabel(block, base.date));
      return [{ block, where: `${labels[index]} · ${time}`, snippet: snippetFor(block.title, others, words) }];
    }),
  );
}

/** 标题里缺的词（按搜索词的先后），在备注、开销说明里按顺序找第一次出现的地方，取前后各几个字。 */
function snippetFor(
  title: string,
  others: ReadonlyArray<{ label: "备注" | "开销"; text: string }>,
  words: readonly string[],
): SearchHit["snippet"] {
  const missing = words.filter((word) => !title.toLowerCase().includes(word));
  if (missing.length === 0) return null;
  for (const other of others) {
    const lower = other.text.toLowerCase();
    for (const word of missing) {
      const at = lower.indexOf(word);
      if (at < 0) continue;
      const from = Math.max(0, at - SNIPPET_CONTEXT);
      const to = Math.min(other.text.length, at + word.length + SNIPPET_CONTEXT);
      const text = (from > 0 ? "…" : "") + other.text.slice(from, to) + (to < other.text.length ? "…" : "");
      return { label: other.label, text };
    }
  }
  // 走到这里说明缺的词都在标题里——和上面 missing 的算法矛盾，不可能发生
  throw new Error("搜索命中了，却在备注和开销里找不到标题缺的词");
}
