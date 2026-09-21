/**
 * 手机上横着画的时间线：条下面那几行字怎么排。
 *
 * 一条铁规矩：**每条字前面那个同色的点，一律钉在自己那块的左边沿，一像素都不挪**
 * （你提的：「点的最左出现颜色的地方，应该与块的最左出现颜色的地方是垂直的」）。
 * 点在哪儿，那件事就从哪儿开始，不用数格子。
 *
 * 点钉死之后，字只能靠「换行」和「写短一点」来让开，规则按这个顺序试：
 * 1. 字放点右边，写「名字 时长」
 * 2. 右边到头了，只写名字——块有多宽本来就是时长，不用重复说
 * 3. 名字也放不下，把字翻到点的左边（点仍在原处）
 * 4. 这一行挤就换下一行
 * 5. 写完整会把紧挨着的下一件挤到别的行、只写名字就不会：只写名字（行数更少，你要的「以最少行数呈现」）
 *
 * 位置钉死时，这样排出来的行数是最少的（每条按开始先后放进第一条放得下的行，
 * 就是区间图的贪心着色，行数正好等于「同一横向位置上最多压着几条」）。
 */

/** 点多大、点和字之间留多少（像素） */
const DOT = 5;
const DOT_GAP = 2;
/** 同一行两条字之间至少留多少（像素） */
const GAP = 8;

export interface LabelInput {
  /** 认这条字是哪件事用的，一般是块 id */
  key: string;
  /** 这件事从哪儿开始，已经换算成条上的像素 */
  x: number;
  /** 完整的字：名字加时长 */
  full: string;
  /** 只有名字那一版 */
  short: string;
}

export interface PlacedLabel extends LabelInput {
  /** 排在第几行，从 0 起 */
  row: number;
  /** 字（连同点）从哪儿开始画 */
  at: number;
  /** 字加点一共多宽 */
  width: number;
  /** 实际写出来的字：放不下时是 `short` */
  text: string;
  /** 字翻到点左边了吗 */
  flip: boolean;
}

/**
 * @param items 这一天要标的每件事
 * @param measure 量一段字多宽（像素）。外面注进来：真的那份用 canvas，测试用假的
 * @param trackWidth 条有多宽（像素），字不许超出去
 */
export function packLabels(
  items: readonly LabelInput[],
  measure: (text: string) => number,
  trackWidth: number,
): PlacedLabel[] {
  const widthOf = (text: string) => DOT + DOT_GAP + measure(text);
  // 按开始先后放：位置钉死时，这样每条放进第一条放得下的行，行数最少
  const inOrder = [...items].sort((a, b) => a.x - b.x || a.key.localeCompare(b.key));
  /** 每一行已经占了哪几段 */
  const rows: [number, number][][] = [];

  const free = (row: number, span: [number, number]) =>
    (rows[row] ?? []).every(([from, to]) => span[0] > to + GAP || span[1] < from - GAP);

  return inOrder.map((item, index) => {
    const full = widthOf(item.full);
    const short = widthOf(item.short);
    const fitsFull = item.x + full <= trackWidth;
    const fitsShort = item.x + short <= trackWidth;
    let text = fitsFull ? item.full : item.short;
    let width = fitsFull ? full : short;
    // 名字都写不下才翻过去；翻过去时字的右端贴着点，点还在 x
    const flip = !fitsFull && !fitsShort;
    const at = flip ? Math.max(0, item.x + DOT - width) : item.x;

    // 放进第一条不挤的行。按开始先后放，挤不挤只看左边已经放下的，这一条自己写长写短都一样
    let row = 0;
    while (!free(row, [at, at + width])) row += 1;

    // 写短只对「下一件」有用：写完整会把它挤到别的行、只写名字就不会，而且它在上面几行也放不下——那就只写名字
    const next = inOrder[index + 1];
    if (next !== undefined && !flip && width === full) {
      const nextFitsAbove = Array.from({ length: row }, (_, above) => above).some((above) =>
        free(above, [next.x, next.x]),
      );
      const blockedByFull = next.x <= at + full + GAP;
      const clearOfShort = next.x > at + short + GAP;
      if (!nextFitsAbove && blockedByFull && clearOfShort) {
        text = item.short;
        width = short;
      }
    }

    (rows[row] ??= []).push([at, at + width]);
    return { ...item, row, at, width, text, flip };
  });
}

/** 点的中心在哪儿：引线要对着它画，所以单独给一个，别在各处重算 */
export function dotCenter(label: PlacedLabel): number {
  return label.x + DOT / 2;
}

/**
 * 量一段字多宽（像素）。真用画布量——估出来的偏小，一偏小「放得下」的就挤在一起了。
 * 拿不到画布（测试环境没实现 canvas）时退回估算：中文按 10、其余按 5.5。
 */
export function makeMeasure(font: string): (text: string) => number {
  const context = document.createElement("canvas").getContext("2d");
  if (context === null) {
    return (text) => [...text].reduce((width, char) => width + (/[一-龥]/.test(char) ? 10 : 5.5), 0);
  }
  context.font = font;
  return (text) => context.measureText(text).width;
}
