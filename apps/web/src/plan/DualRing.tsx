import { useState, type ReactNode } from "react";
import type { RingRow } from "./shares";

/** 画多大（SVG 里的单位，外面按容器缩放） */
const SIZE = 340;
const MID = SIZE / 2;
/** 外圈（开销）、内圈（时间）各自的半径和粗细 */
const OUTER = { r: 128, w: 30 };
const INNER = { r: 88, w: 24 };
/** 段和段之间留的空（弧长）：不留就分不出两段 */
const GAP = 4;
/** 环外一圈刻度：40 格（每 2.5% 一格），每 8 格长一点 */
const TICKS = 40;
const EMPTY_RING = "rgb(47 58 69 / 0.07)";
const REST_RING = "rgb(47 58 69 / 0.12)";

interface DualRingProps {
  rows: readonly RingRow[];
  /** 内圈末尾那一段灰的：还没排的时长 */
  unscheduledMinutes: number;
  /** 外圈、内圈是不是空的（一笔开销都没填金额 / 一件排了时间的事都没有） */
  moneyEmpty: boolean;
  timeEmpty: boolean;
  /** 现在指着哪一类（`kindId`，「其余 N 类」是空字符串用 name 认）；null 是都不指 */
  hovered: string | null;
  onHover: (key: string | null) => void;
  onPick: (key: string) => void;
  /** 中间写什么 */
  children: ReactNode;
}

const keyOf = (row: RingRow) => row.kindId || row.name;

/**
 * 同心双环（你选的小样 B）：外圈是开销、内圈是时间，同一个类型两圈同色。
 * 停在一类上两圈一起亮、别的变淡，中间的字由外面换（`children`）。
 * 环整个读屏跳过：能按的是环外贴着的那圈标签（在 `RingLabels` 里），键盘和读屏走那边。
 */
export function DualRing({
  rows,
  unscheduledMinutes,
  moneyEmpty,
  timeEmpty,
  hovered,
  onHover,
  onPick,
  children,
}: DualRingProps) {
  const arcs = (ring: typeof OUTER, values: number[], extra = 0) => {
    const circumference = 2 * Math.PI * ring.r;
    const total = values.reduce((sum, value) => sum + value, 0) + extra;
    let offset = 0;
    return values.map((value) => {
      const length = total === 0 ? 0 : (value / total) * circumference;
      const arc = { length: Math.max(0, length - GAP), offset, circumference };
      offset += length;
      return arc;
    });
  };
  const outer = arcs(OUTER, rows.map((row) => row.cents));
  const inner = arcs(INNER, rows.map((row) => row.minutes), unscheduledMinutes);
  const innerCircumference = 2 * Math.PI * INNER.r;
  const innerUsed = inner.reduce((sum, arc, index) => sum + (rows[index]!.minutes === 0 ? 0 : arc.length + GAP), 0);

  return (
    <div className="dual-ring">
      <svg aria-hidden data-dual-ring viewBox={`0 0 ${SIZE} ${SIZE}`} className="size-full" onPointerLeave={() => onHover(null)}>
        {/* 环外一圈断开的细刻度：浅色底上的「未来感」靠它、等宽数字和切角，不靠发光（发光只有暗底才发得亮） */}
        {Array.from({ length: TICKS }, (_, index) => {
          const angle = (index / TICKS) * Math.PI * 2 - Math.PI / 2;
          const long = index % 8 === 0;
          const from = OUTER.r + OUTER.w / 2 + 6;
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
        {/* 空着的那一圈画成整圈淡灰：环一直在，页面不会因为有没有数据跳来跳去 */}
        {moneyEmpty && <circle cx={MID} cy={MID} r={OUTER.r} fill="none" stroke={EMPTY_RING} strokeWidth={OUTER.w} />}
        {timeEmpty && <circle cx={MID} cy={MID} r={INNER.r} fill="none" stroke={EMPTY_RING} strokeWidth={INNER.w} />}
        {rows.map((row, index) => {
          const key = keyOf(row);
          const dim = hovered !== null && hovered !== key;
          return (
            <g key={key} className={dim ? "ring-arc is-dim" : "ring-arc"}>
              {row.cents > 0 && (
                <circle
                  data-ring="money"
                  data-key={key}
                  cx={MID}
                  cy={MID}
                  r={OUTER.r}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={OUTER.w}
                  strokeDasharray={`${outer[index]!.length} ${outer[index]!.circumference - outer[index]!.length}`}
                  strokeDashoffset={-outer[index]!.offset}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  onPointerEnter={(event) => event.pointerType === "mouse" && onHover(key)}
                  onClick={() => onPick(key)}
                />
              )}
              {row.minutes > 0 && (
                <circle
                  data-ring="time"
                  data-key={key}
                  cx={MID}
                  cy={MID}
                  r={INNER.r}
                  fill="none"
                  stroke={row.color}
                  strokeWidth={INNER.w}
                  strokeDasharray={`${inner[index]!.length} ${inner[index]!.circumference - inner[index]!.length}`}
                  strokeDashoffset={-inner[index]!.offset}
                  transform={`rotate(-90 ${MID} ${MID})`}
                  onPointerEnter={(event) => event.pointerType === "mouse" && onHover(key)}
                  onClick={() => onPick(key)}
                />
              )}
            </g>
          );
        })}
        {/* 内圈末尾那一段：还没排的时长 */}
        {unscheduledMinutes > 0 && !timeEmpty && (
          <circle
            data-ring="rest"
            cx={MID}
            cy={MID}
            r={INNER.r}
            fill="none"
            stroke={REST_RING}
            strokeWidth={INNER.w}
            strokeDasharray={`${Math.max(0, innerCircumference - innerUsed - GAP)} ${innerUsed + GAP}`}
            strokeDashoffset={-innerUsed}
            transform={`rotate(-90 ${MID} ${MID})`}
          />
        )}
      </svg>
      <div className="dual-ring-center">{children}</div>
    </div>
  );
}

/** 环外贴着的一圈标签：每一类一个按钮（键盘、读屏走这里）。位置按它在外圈（没开销就按内圈）的中点角度算。 */
export function ringLabelPlaces(rows: readonly RingRow[], unscheduledMinutes: number) {
  const totals = {
    money: rows.reduce((sum, row) => sum + row.cents, 0),
    time: rows.reduce((sum, row) => sum + row.minutes, 0) + unscheduledMinutes,
  };
  let moneyAt = 0;
  let timeAt = 0;
  return rows.map((row) => {
    const moneyShare = totals.money === 0 ? 0 : row.cents / totals.money;
    const timeShare = totals.time === 0 ? 0 : row.minutes / totals.time;
    const mid = row.cents > 0 ? moneyAt + moneyShare / 2 : timeAt + timeShare / 2;
    moneyAt += moneyShare;
    timeAt += timeShare;
    const angle = mid * Math.PI * 2 - Math.PI / 2;
    // 半径一律按外圈算：只有时间的那几类要是贴着内圈放，标签会压在外圈上
    const radius = OUTER.r + OUTER.w / 2 + 34;
    return {
      key: keyOf(row),
      row,
      left: ((MID + Math.cos(angle) * radius) / SIZE) * 100,
      top: ((MID + Math.sin(angle) * radius) / SIZE) * 100,
    };
  });
}
