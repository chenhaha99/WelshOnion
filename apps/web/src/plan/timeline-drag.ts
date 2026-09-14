/**
 * 时间轴拖拽的换算，全部用「线性分钟」：第几行 × 1440 + 这一行第几分钟，和 core 挪块的换算是同一个模型。
 */

const MINUTES_PER_DAY = 1440;
/** 拖拽吸附到几分钟 */
const SNAP_MIN = 15;

/** 拖中间是挪，拖左端改开始，拖右端改结束。 */
export type DragMode = "move" | "start" | "end";

/** 指针在第几行、这一行第几分钟；分钟不夹在 0–1440 里（拖出这一行右边就是过了 24 点）。 */
export interface PointerSpot {
  row: number;
  minute: number;
}

/** 块的开始（线性分钟）和时长。 */
export interface Span {
  start: number;
  duration: number;
}

/**
 * 松手后块的开始和时长。三种拖法都按指针移动的距离算、吸附到 15 分钟：
 * 只看差值，按在块的哪一段、按在端点里面几像素，没动时都还在原位。
 * 左端不晚于结束，右端不早于开始；没动的那一头保持原值，不跟着吸附。
 */
export function dragResult(mode: DragMode, down: PointerSpot, now: PointerSpot, block: Span): Span {
  const delta = linear(now) - linear(down);
  const end = block.start + block.duration;
  if (mode === "move") return { start: snap(block.start + delta), duration: block.duration };
  if (mode === "start") {
    const start = Math.min(snap(block.start + delta), end);
    return { start, duration: end - start };
  }
  const movedEnd = Math.max(snap(end + delta), block.start);
  return { start: block.start, duration: movedEnd - block.start };
}

export function linear(spot: PointerSpot): number {
  return spot.row * MINUTES_PER_DAY + spot.minute;
}

/** 线性位置拆成第几行、这一行第几分钟。 */
export function splitLinear(value: number): PointerSpot {
  const row = Math.floor(value / MINUTES_PER_DAY);
  return { row, minute: value - row * MINUTES_PER_DAY };
}

/** 夹在计划里，和 core 的换算一样：往前出界到第一行 0 分钟，往后出界到最后一行 1439 分钟。 */
export function clampLinear(value: number, rowCount: number): number {
  if (value < 0) return 0;
  return Math.min(value, rowCount * MINUTES_PER_DAY - 1);
}

/** 预览框每行一段：开始先夹在计划里，按一行 1440 分钟切，超出最后一行的截掉；时长为 0 是一个点。 */
export function previewSegments(
  start: number,
  duration: number,
  rowCount: number,
): Array<{ row: number; from: number; to: number }> {
  const from = clampLinear(start, rowCount);
  const first = splitLinear(from);
  if (duration === 0) return [{ row: first.row, from: first.minute, to: first.minute }];

  const end = from + duration;
  const segments: Array<{ row: number; from: number; to: number }> = [];
  for (let row = first.row; row < rowCount && row * MINUTES_PER_DAY < end; row++) {
    const rowStart = row * MINUTES_PER_DAY;
    segments.push({
      row,
      from: Math.max(from, rowStart) - rowStart,
      to: Math.min(end, rowStart + MINUTES_PER_DAY) - rowStart,
    });
  }
  return segments;
}

/** 四舍五入到 15 分钟；加 0 把 -0 变成 0。 */
function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN + 0;
}
