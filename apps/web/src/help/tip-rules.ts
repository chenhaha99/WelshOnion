import type { HelpId } from "./help-usage";

/**
 * 场景小提示的规则，照苹果 TipKit（WWDC23「Make features discoverable with TipKit」、HIG「Offering help」）：
 * - 条件满足才出（when），用过那个功能的不出（已经会的人不该再看到提示）
 * - 点过 ✕ 的永远不出；出现满 5 次还没采纳就作废（TipKit 示例的 maxDisplayCount 是 5）
 * - 同一时间一条；换一条新的至少隔一天（HIG：「once every 24 hours」），同一条可以接着出
 */
export interface TipDef<Ctx> {
  id: string;
  /** 用过这个功能就不再出 */
  help: HelpId;
  when: (ctx: Ctx) => boolean;
  title: string;
  body: string;
}

export interface TipState {
  /** 每条出现过几次 */
  shown: Record<string, number>;
  /** 点过 ✕ 的 */
  closed: string[];
  /** 上一次出现的是哪条、什么时候（毫秒） */
  last: { id: string; at: number } | null;
}

export const EMPTY_TIP_STATE: TipState = { shown: {}, closed: [], last: null };

export const MAX_SHOWN = 5;
const GAP_MS = 24 * 3600_000;

export function pickTip<Ctx>(
  tips: readonly TipDef<Ctx>[],
  ctx: Ctx,
  used: ReadonlySet<HelpId>,
  state: TipState,
  now: number,
): TipDef<Ctx> | null {
  const eligible = tips.filter(
    (tip) =>
      tip.when(ctx) && !used.has(tip.help) && !state.closed.includes(tip.id) && (state.shown[tip.id] ?? 0) < MAX_SHOWN,
  );
  // 上次那条还能出就接着出它：不然排在前面的新一条被一天的间隔挡住，就一条都不出了
  const again = eligible.find((tip) => tip.id === state.last?.id);
  if (again !== undefined) return again;
  const next = eligible[0];
  if (next === undefined) return null;
  return state.last === null || now - state.last.at >= GAP_MS ? next : null;
}

/** 出现了一次（每次打开页面算一次，不是每次重画） */
export function recordShown(state: TipState, id: string, now: number): TipState {
  return { ...state, shown: { ...state.shown, [id]: (state.shown[id] ?? 0) + 1 }, last: { id, at: now } };
}

/** 点了 ✕ */
export function recordClosed(state: TipState, id: string): TipState {
  return state.closed.includes(id) ? state : { ...state, closed: [...state.closed, id] };
}
