import { useState, type ReactNode } from "react";

/** 环上的一段：按值占一圈的比例。 */
export interface DonutSlice {
  key: string;
  color: string;
  value: number;
  /** 鼠标停上去写的字：「住宿 ¥480 · 32%」 */
  label: string;
  /** 第二行：「2 笔 · 挂在 2 件事上」「4 件事」 */
  detail: string;
}

interface DonutProps {
  slices: readonly DonutSlice[];
  /** 现在指着哪一类（说明里停上去也算）；null 是都不指 */
  hovered: string | null;
  onHover: (key: string | null) => void;
  onPick: (key: string) => void;
  /** 中间的大字和小字 */
  children: ReactNode;
}

const SIZE = 160;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUM = 2 * Math.PI * RADIUS;
/** 段和段之间留的空（弧长，像素）：太满了分不出几段 */
const GAP = 3;

/**
 * 按比例分段的环，中间写合计。环整个读屏跳过（`aria-hidden`）：能按的是说明里每一类的按钮，
 * 键盘和读屏走那边；环是给眼睛和鼠标的。鼠标停在某一段上，那一段变粗、别的变淡，跟着鼠标出一小块。
 */
export function Donut({ slices, hovered, onHover, onPick, children }: DonutProps) {
  // 一小块跟着鼠标：位置是相对环这个框的像素
  const [tip, setTip] = useState<{ x: number; y: number } | null>(null);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const shown = hovered === null ? null : (slices.find((slice) => slice.key === hovered) ?? null);

  let offset = 0;
  // 只有一类时不留空：留了就成了个缺口，像少画了一块
  const gap = slices.length > 1 ? GAP : 0;
  const arcs = slices.map((slice) => {
    const length = (slice.value / total) * CIRCUM;
    const arc = { key: slice.key, color: slice.color, length: Math.max(0, length - gap), offset };
    offset += length;
    return arc;
  });

  return (
    <div className="relative flex shrink-0 items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg
        aria-hidden
        data-donut
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-full -rotate-90"
        onPointerLeave={() => {
          onHover(null);
          setTip(null);
        }}
      >
        {arcs.map((arc) => {
          const dim = hovered !== null && hovered !== arc.key;
          return (
            <circle
              key={arc.key}
              data-slice={arc.key}
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke={arc.color}
              strokeWidth={hovered === arc.key ? STROKE + 6 : STROKE}
              strokeDasharray={`${arc.length} ${CIRCUM - arc.length}`}
              strokeDashoffset={-arc.offset}
              opacity={dim ? 0.35 : 1}
              className="cursor-pointer transition-[stroke-width,opacity] duration-150"
              onPointerEnter={(event) => {
                if (event.pointerType !== "mouse") return;
                onHover(arc.key);
              }}
              onPointerMove={(event) => {
                if (event.pointerType !== "mouse") return;
                const box = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
                setTip({ x: event.clientX - box.left, y: event.clientY - box.top });
              }}
              onClick={() => onPick(arc.key)}
            />
          );
        })}
      </svg>
      <div className="pointer-events-none absolute flex flex-col items-center text-center">{children}</div>
      {shown !== null && tip !== null && (
        <div
          data-donut-tip
          className="donut-tip"
          style={{ left: tip.x, top: tip.y }}
        >
          <span className="font-medium">{shown.label}</span>
          <span className="text-ink-muted">{shown.detail}</span>
        </div>
      )}
    </div>
  );
}
