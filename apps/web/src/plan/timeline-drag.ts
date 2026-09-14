/**
 * 时间轴拖拽的换算。位置全部用「线性分钟」：第几行 × 1440 + 这一行第几分钟，和 core 挪块的换算是同一个模型；
 * 另有拖动中框边自己滚、松手后的时间写在哪这两样按屏幕像素算的。
 */

const MINUTES_PER_DAY = 1440;
/** 拖拽吸附到几分钟 */
const SNAP_MIN = 15;
/** 框边自己滚：离边多少像素以内开始滚，正在边上时每帧滚多少像素 */
const EDGE_ZONE_PX = 40;
const EDGE_MAX_STEP_PX = 10;
/** 松手后的时间：字离指针多远，离屏幕左右边、上边至少多远（像素） */
const LABEL_GAP_PX = 56;
const LABEL_MARGIN_PX = 8;

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

/**
 * 开始时刻换算成变回没排时间时的格子：06:00–11:59 上午、12:00–17:59 下午、18:00–23:59 晚上；
 * 00:00–05:59 不属于任何一格，归整天。
 */
export function slotOfMinute(minute: number): "day" | "morning" | "afternoon" | "evening" {
  if (minute >= 1080) return "evening";
  if (minute >= 720) return "afternoon";
  if (minute >= 360) return "morning";
  return "day";
}

/** 没排时间的块拖上时间轴时的开始分钟：吸附到 15 分钟，夹在 00:00–23:45（排上时间的操作只收 0–1439，不做过午夜的换算）。 */
export function undatedStartMinute(minute: number): number {
  return Math.min(Math.max(snap(minute), 0), MINUTES_PER_DAY - SNAP_MIN);
}

/** 竖排里拖不换天：开始时刻夹在块开始那天（第 row 行）的 00:00–23:45。 */
export function clampToDay(start: number, row: number): number {
  const dayStart = row * MINUTES_PER_DAY;
  return Math.min(Math.max(start, dayStart), dayStart + MINUTES_PER_DAY - SNAP_MIN);
}

/**
 * 竖排拖动中这一帧框要滚多少像素，负数往上、正数往下。top、bottom 是框露在屏幕里那部分的上下边。
 * 指针离上边或下边 40 像素以内往那边滚，越靠边越快、至少 1 像素；拖出了边按最快。
 */
export function edgeScrollStep(pointerY: number, top: number, bottom: number): number {
  const fromTop = pointerY - top;
  const fromBottom = bottom - pointerY;
  if (fromTop < EDGE_ZONE_PX && fromTop <= fromBottom) return -edgeSpeed(fromTop);
  if (fromBottom < EDGE_ZONE_PX) return edgeSpeed(fromBottom);
  return 0;
}

function edgeSpeed(distance: number): number {
  return Math.max(1, Math.round(((EDGE_ZONE_PX - Math.max(distance, 0)) / EDGE_ZONE_PX) * EDGE_MAX_STEP_PX));
}

/**
 * 松手后的时间写在屏幕上哪里：手指按着的地方看不见，所以字的下边在指针上方 56 像素，横向以指针为中心、左右夹在屏幕里；
 * 上面放不下（离屏幕上边不到 8 像素）就放在指针下方 56 像素。
 */
export function dragLabelPlace(
  pointer: { x: number; y: number },
  size: { width: number; height: number },
  viewportWidth: number,
): { left: number; top: number } {
  const left = Math.min(
    Math.max(pointer.x - size.width / 2, LABEL_MARGIN_PX),
    viewportWidth - size.width - LABEL_MARGIN_PX,
  );
  const above = pointer.y - LABEL_GAP_PX - size.height;
  return { left, top: above >= LABEL_MARGIN_PX ? above : pointer.y + LABEL_GAP_PX };
}

/** 四舍五入到 15 分钟；加 0 把 -0 变成 0。 */
function snap(minutes: number): number {
  return Math.round(minutes / SNAP_MIN) * SNAP_MIN + 0;
}
