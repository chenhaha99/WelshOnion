import { useEffect, useRef, useState } from "react";
import { HELP_HREF } from "../app/route";
import { useNow } from "../app/services";
import { useUsed } from "./help-usage";
import { EMPTY_TIP_STATE, pickTip, recordClosed, recordShown, type TipDef, type TipState } from "./tip-rules";

const STATE_KEY = "welshonion.tips";
const COUNTS_KEY = "welshonion.tip-counts";

/** 提示的出现条件要数的几样：时间线打开过几次、拖过几次（都记在这台设备上） */
export type TipCount = "timelineVisits" | "drags";

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    // 存坏了：从头算，最多多看到一次提示
    return fallback;
  }
}

export function readCounts(): Record<TipCount, number> {
  return readJson(COUNTS_KEY, { timelineVisits: 0, drags: 0 });
}

export function bumpCount(name: TipCount): void {
  const counts = readCounts();
  localStorage.setItem(COUNTS_KEY, JSON.stringify({ ...counts, [name]: counts[name] + 1 }));
}

function readTipState(): TipState {
  return readJson(STATE_KEY, EMPTY_TIP_STATE);
}

function saveTipState(state: TipState): void {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/** 时间线上的提示看的情况 */
export interface TimelineTipContext {
  phone: boolean;
  /** 有一件事选中着 */
  selected: boolean;
  /** 有排上时间的事 */
  hasTimed: boolean;
  /** 有没排时间的事 */
  hasUndated: boolean;
  visits: number;
  drags: number;
}

/**
 * 第一批时间线上的提示（你同意的）。按先后排：同一时间只出第一条满足条件的。
 * 写法照 HIG：标题说是什么功能，下面一句说怎么做
 */
export const TIMELINE_TIPS: TipDef<TimelineTipContext>[] = [
  {
    id: "phone-handle",
    help: "handle-drag",
    when: (ctx) => ctx.phone && ctx.selected,
    title: "拖两端改长短",
    body: "按住选中那件两边的把手，左右拖。",
  },
  {
    id: "phone-long-press",
    help: "long-press-drag",
    when: (ctx) => ctx.phone && ctx.hasTimed && ctx.visits >= 2,
    title: "长按拖着改时间",
    body: "按住色块半秒拿起来，左右挪改时间，上下拖到别的天就换天。",
  },
  {
    id: "phone-pinch",
    help: "pinch",
    when: (ctx) => ctx.phone && ctx.visits >= 3,
    title: "双指放大",
    body: "两根手指张开，整条时间线一起放大，看得更细。",
  },
  {
    id: "wide-blank-add",
    help: "blank-add",
    when: (ctx) => !ctx.phone,
    title: "点空白处加一件事",
    body: "点一下是 1 小时，按住拖出一段想多长就多长。",
  },
  {
    id: "wide-onto",
    help: "onto",
    when: (ctx) => !ctx.phone && ctx.drags >= 1,
    title: "叠上去还是放旁边",
    body: "拖到别的事中间是叠上去，跟着它走；拖到它上下边是并排。",
  },
  {
    id: "wide-alt-copy",
    help: "alt-copy",
    when: (ctx) => !ctx.phone && ctx.drags >= 3,
    title: "按住 Alt 拖是复制",
    body: "原来那件不动，拖出一份新的。",
  },
  {
    id: "wide-tray",
    help: "tray-to-axis",
    when: (ctx) => !ctx.phone && ctx.hasUndated,
    title: "拖上去排时间",
    body: "把「没排时间」里的事拖到时间线上，就排上了时间。",
  },
];

export const HOME_TIPS: TipDef<{ plans: number }>[] = [
  {
    id: "home-card-menu",
    help: "card-menu",
    when: (ctx) => ctx.plans >= 2,
    title: "更多操作",
    body: "手机上长按卡片、电脑上右键，能复制、删除。",
  },
];

/**
 * 这个地方现在该出哪条提示（没有是 null）。每次打开页面，出现的那条记一次；用过那个功能，它当场消失。
 */
export function useTip<Ctx>(tips: readonly TipDef<Ctx>[], ctx: Ctx): { tip: TipDef<Ctx> | null; close: () => void } {
  const used = useUsed();
  const now = useNow();
  const [state, setState] = useState(readTipState);
  const nowMs = Date.parse(now());
  // 这一屏上已经出来的那条一直留着，直到点 ✕、用了那个功能、离开这一屏——不跟着条件忽隐忽现：
  // 手机上选中时出的「拖两端改长短」，点别处取消选中时要是跟着消失，下面整块往上一跳，这一下就点空了
  const [current, setCurrent] = useState<string | null>(null);
  const kept = tips.find((tip) => tip.id === current && !used.has(tip.help) && !state.closed.includes(tip.id));
  const tip = kept ?? pickTip(tips, ctx, used, state, nowMs);
  if (tip !== null && tip.id !== current) setCurrent(tip.id);
  const recorded = useRef(new Set<string>());
  useEffect(() => {
    if (tip === null || recorded.current.has(tip.id)) return;
    recorded.current.add(tip.id);
    const next = recordShown(readTipState(), tip.id, nowMs);
    saveTipState(next);
    setState(next);
    // 只看这一条是谁：同一条重画不算又出现一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tip?.id]);
  return {
    tip,
    close: () => {
      if (tip === null) return;
      const next = recordClosed(readTipState(), tip.id);
      saveTipState(next);
      setState(next);
    },
  };
}

/** 提示条：嵌在界面里（照 TipKit 的 inline 提示：不挡住下面的东西），标题 + 一句 +「怎么用」+ ✕ */
export function TipBar<Ctx>({ tip, onClose }: { tip: TipDef<Ctx>; onClose: () => void }) {
  return (
    <div role="note" aria-label={`提示：${tip.title}`} className="tip-bar">
      <span aria-hidden className="tip-bar-icon">
        💡
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-ink">{tip.title}</p>
        <p className="text-ink-muted">
          {tip.body}{" "}
          <a href={HELP_HREF} className="whitespace-nowrap text-sage-deep hover:underline">
            怎么用
          </a>
        </p>
      </div>
      <button type="button" aria-label="关掉提示" className="btn btn-ghost btn-icon -mt-1 -mr-1" onClick={onClose}>
        ✕
      </button>
    </div>
  );
}
