import type { ReactNode } from "react";
import type { RingRow } from "./shares";

/** 画多大（SVG 里的单位，外面按容器缩放） */
const SIZE = 340;
const MID = SIZE / 2;
/** 环的半径和粗细。只有一个环，洞比双环时大，圆心塞得下开关加三行字 */
const RING = { r: 124, w: 30 };
/** 段和段之间留的空（弧长）：不留就分不出两段 */
const GAP = 4;
/** 环外一圈刻度：40 格（每 2.5% 一格），每 8 格长一点 */
const TICKS = 40;
const EMPTY_RING = "rgb(47 58 69 / 0.07)";
const REST_RING = "rgb(47 58 69 / 0.12)";

/** 环这会儿画的是哪个维度 */
export type RingKind = "money" | "time";

interface KindRingProps {
  rows: readonly RingRow[];
  /** 画开销还是画时间（圆心的开关定） */
  kind: RingKind;
  /** 画时间时末尾那一段灰的：还没排的时长 */
  unscheduledMinutes: number;
  /** 当前这个维度画不画得出来（一笔开销都没填金额 / 一件排了时间的事都没有） */
  empty: boolean;
  /** 现在指着哪一类（`kindId`，「其余 N 类」是空字符串用 name 认）；null 是都不指 */
  hovered: string | null;
  onHover: (key: string | null) => void;
  onPick: (key: string) => void;
  /** 圆心里放什么（开关和那几行字） */
  children: ReactNode;
}

const keyOf = (row: RingRow) => row.kindId || row.name;

/**
 * 总览那个环：一个环，画开销还是画时间由圆心的开关定。
 * 停在一类上这一段亮、别的变淡；圆心的字由外面换（`children`）。
 *
 * 换维度时每段**原地胀缩**——段的先后永远按开销从多到少，不重排，所以看得出哪一类胀了、哪一类瘪了。
 * 做法是不管值是不是 0，`<circle>` 都留着不卸载，只改 `stroke-dasharray`，CSS 才补得出中间的动画；
 * 值是 0 的那几段不带 `data-ring-seg`（环上确实没有它）。
 *
 * 环整个读屏跳过：能按的是环下面每类那一行，键盘和读屏走那边。
 */
export function KindRing({ rows, kind, unscheduledMinutes, empty, hovered, onHover, onPick, children }: KindRingProps) {
  const circumference = 2 * Math.PI * RING.r;
  const values = rows.map((row) => (kind === "money" ? row.cents : row.minutes));
  const rest = kind === "time" ? unscheduledMinutes : 0;
  const total = values.reduce((sum, value) => sum + value, 0) + rest;

  let offset = 0;
  const arcs = values.map((value) => {
    const length = total === 0 ? 0 : (value / total) * circumference;
    const arc = { length: Math.max(0, length - GAP), offset, on: value > 0 };
    offset += length;
    return arc;
  });
  const restArc = { length: rest === 0 || empty ? 0 : Math.max(0, circumference - offset - GAP), offset };
  const dash = (length: number) => `${length} ${circumference - length}`;

  return (
    <div className="kind-ring">
      <svg aria-hidden data-kind-ring viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" onPointerLeave={() => onHover(null)}>
        {/* 环外一圈断开的细刻度：浅色底上的「未来感」靠它、等宽数字和切角，不靠发光（发光只有暗底才发得亮） */}
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
          const long = index % 8 === 0;
          const from = RING.r + RING.w / 2 + 6;
          const to = from + (long ? 9 : 5);
          return (
            <line
              key={index}
              className="ring-tick"
              strokeWidth={long ? 1.5 : 1}
              x1={MID + Math.cos(angle) * from}
              y1={MID + Math.sin(angle) * from}
              x2={MID + Math.cos(angle) * to}
              y2={MID + Math.sin(angle) * to}
            />
          );
        })}
        {/* 画不出来时是整圈淡灰：环一直在，页面不会因为有没有数据跳来跳去 */}
        {empty && <circle cx={MID} cy={MID} r={RING.r} fill="none" stroke={EMPTY_RING} strokeWidth={RING.w} />}
        {rows.map((row, index) => {
          const key = keyOf(row);
          const arc = arcs[index]!;
          return (
            <circle
              key={key}
              data-ring-seg={arc.on ? "" : undefined}
              data-key={key}
              className={hovered !== null && hovered !== key ? "ring-arc is-dim" : "ring-arc"}
              cx={MID}
              cy={MID}
              r={RING.r}
              fill="none"
              stroke={row.color}
              strokeWidth={RING.w}
              strokeDasharray={dash(arc.length)}
              strokeDashoffset={-arc.offset}
              transform={`rotate(-90 ${MID} ${MID})`}
              onPointerEnter={(event) => event.pointerType === "mouse" && onHover(key)}
              onClick={() => arc.on && onPick(key)}
            />
          );
        })}
        {/* 末尾那一段：还没排的时长。画开销时没这个概念，它缩成 0 */}
        <circle
          data-ring-rest={restArc.length > 0 ? "" : undefined}
          className="ring-arc"
          cx={MID}
          cy={MID}
          r={RING.r}
          fill="none"
          stroke={REST_RING}
          strokeWidth={RING.w}
          strokeDasharray={dash(restArc.length)}
          strokeDashoffset={-restArc.offset}
          transform={`rotate(-90 ${MID} ${MID})`}
        />
      </svg>
      <div className="kind-ring-center">{children}</div>
    </div>
  );
}
