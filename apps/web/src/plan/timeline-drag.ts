/**
 * 时间线拖拽的换算。位置全部用「线性分钟」：第几行 × 1440 + 这一行第几分钟，和 core 挪块的换算是同一个模型；
 * 另有拖动中框边自己滚、松手后的时间写在哪这两样按屏幕像素算的。
 */

const MINUTES_PER_DAY = 1440;
/** 拖拽吸附到几分钟 */
const SNAP_MIN = 15;
/** 点一下空白加的事多长（分钟） */
const BLANK_ADD_MIN = 60;
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
 * 磁铁（手机上）：落点那一天别的事的开始、结束（线性分钟），离得不到 tolerance 分钟就吸上去，不按 15 分钟取整。
 * 照 Final Cut Pro 的吸附到片段边沿；tolerance 由调用方按当时的缩放把 10 像素换成分钟。
 */
export interface Magnet {
  edges: readonly number[];
  tolerance: number;
}

/**
 * 松手后块的开始和时长。三种拖法都按指针移动的距离算、吸附到 15 分钟：
 * 只看差值，按在块的哪一段、按在端点里面几像素，没动时都还在原位。
 * 左端不晚于结束，右端不早于开始；没动的那一头保持原值，不跟着吸附。
 * 给了磁铁、又够得着别的事的边，就吸到那条边上（挪的时候开始、结束哪头近吸哪头）。
 */
export function dragResult(mode: DragMode, down: PointerSpot, now: PointerSpot, block: Span, magnet?: Magnet): Span {
  const delta = linear(now) - linear(down);
  const end = block.start + block.duration;
  const hit = magnetHit(mode, delta, block, magnet);
  if (mode === "move") {
    const start = hit === null ? snap(block.start + delta) : hit.side === "start" ? hit.edge : hit.edge - block.duration;
    return { start, duration: block.duration };
  }
  if (mode === "start") {
    const start = Math.min(hit?.edge ?? snap(block.start + delta), end);
    return { start, duration: end - start };
  }
  const movedEnd = Math.max(hit?.edge ?? snap(end + delta), block.start);
  return { start: block.start, duration: movedEnd - block.start };
}

/** 吸上了哪条边（线性分钟）；没吸上、没给磁铁是 null。吸上的那一刻手机轻震一下，靠它看变没变。 */
export function magnetEdge(mode: DragMode, down: PointerSpot, now: PointerSpot, block: Span, magnet?: Magnet): number | null {
  return magnetHit(mode, linear(now) - linear(down), block, magnet)?.edge ?? null;
}

function magnetHit(
  mode: DragMode,
  delta: number,
  block: Span,
  magnet: Magnet | undefined,
): { edge: number; side: "start" | "end" } | null {
  if (magnet === undefined) return null;
  const sides: Array<{ side: "start" | "end"; at: number }> = [];
  if (mode !== "end") sides.push({ side: "start", at: block.start + delta });
  if (mode !== "start") sides.push({ side: "end", at: block.start + block.duration + delta });
  let best: { edge: number; side: "start" | "end"; distance: number } | null = null;
  for (const { side, at } of sides) {
    for (const edge of magnet.edges) {
      const distance = Math.abs(at - edge);
      if (distance <= magnet.tolerance && (best === null || distance < best.distance)) best = { edge, side, distance };
    }
  }
  return best && { edge: best.edge, side: best.side };
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

/** 没排时间的块拖上时间线时的开始分钟：吸附到 15 分钟，夹在 00:00–23:45（排上时间的操作只收 0–1439，不做过午夜的换算）。 */
export function undatedStartMinute(minute: number): number {
  return Math.min(Math.max(snap(minute), 0), MINUTES_PER_DAY - SNAP_MIN);
}

/** 在空白处加一件事：这一天从第几分钟到第几分钟。 */
export interface MinuteRange {
  from: number;
  to: number;
}

/** 点一下空白：从点的钟点往前取到 15 分钟（点在 09:10 框从 09:00 起，指针在框里），画 1 小时；夹在 0–24 点里。 */
export function blankClickRange(minute: number): MinuteRange {
  const from = Math.min(Math.max(floorSnap(minute), 0), MINUTES_PER_DAY - SNAP_MIN);
  return { from, to: Math.min(from + BLANK_ADD_MIN, MINUTES_PER_DAY) };
}

/** 在空白处拖出的一段：从第 row 行的 from 分钟到 to 分钟；跨天时 to 大于 1440（从开始那一行的 00:00 算起）。 */
export interface BlankRange extends MinuteRange {
  row: number;
}

/**
 * 在空白处拖出一段，可以跨天（**你提的**：拖到 24 点就停住了，不能往下继续）：
 * 按下和现在两处按「线性分钟」算（第几行 × 1440 + 这一行第几分钟），早的往前、晚的往后取到 15 分钟，至少 15 分钟；
 * 两头夹在计划第一天的 00:00 和最后一天的 24:00。
 */
export function blankDragSpan(down: PointerSpot, now: PointerSpot, dayCount: number): BlankRange {
  const last = dayCount * MINUTES_PER_DAY;
  const inPlan = (value: number) => Math.min(Math.max(value, 0), last);
  const a = inPlan(linear(down));
  const b = inPlan(linear(now));
  const from = Math.min(floorSnap(Math.min(a, b)), last - SNAP_MIN);
  const to = Math.max(Math.ceil(Math.max(a, b) / SNAP_MIN) * SNAP_MIN, from + SNAP_MIN);
  const start = splitLinear(from);
  return { row: start.row, from: start.minute, to: start.minute + (to - from) };
}

/** 这一段落在第 row 行的那一截：跨天时每一行画自己那一截，沾不到的行是 null。 */
export function blankPieceInRow(range: BlankRange, row: number): MinuteRange | null {
  const start = (range.row - row) * MINUTES_PER_DAY + range.from;
  const from = Math.max(start, 0);
  const to = Math.min(start + (range.to - range.from), MINUTES_PER_DAY);
  return to > from ? { from, to } : null;
}

/** 在空白处拖出一段：按下和现在两个钟点，早的往前、晚的往后取到 15 分钟，至少 15 分钟；夹在 0–24 点里。 */
export function blankDragRange(a: number, b: number): MinuteRange {
  const inDay = (minute: number) => Math.min(Math.max(minute, 0), MINUTES_PER_DAY);
  const from = Math.min(floorSnap(inDay(Math.min(a, b))), MINUTES_PER_DAY - SNAP_MIN);
  const to = Math.max(Math.ceil(inDay(Math.max(a, b)) / SNAP_MIN) * SNAP_MIN, from + SNAP_MIN);
  return { from, to };
}

/**
 * 拖动中这一帧框要滚多少像素，只看一个方向的坐标：pointer 是指针，low、high 是框露在屏幕里那部分靠前、靠后的两条边；
 * 负数往靠前的方向滚、正数往靠后的方向滚。
 * 指针离靠前或靠后的边 40 像素以内往那边滚，越靠边越快、至少 1 像素；拖出了边按最快。
 */
export function edgeScrollStep(pointer: number, low: number, high: number): number {
  const fromLow = pointer - low;
  const fromHigh = high - pointer;
  if (fromLow < EDGE_ZONE_PX && fromLow <= fromHigh) return -edgeSpeed(fromLow);
  if (fromHigh < EDGE_ZONE_PX) return edgeSpeed(fromHigh);
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

/** 往前取到 15 分钟。 */
function floorSnap(minutes: number): number {
  return Math.floor(minutes / SNAP_MIN) * SNAP_MIN + 0;
}
