import { describe, expect, it } from "vitest";
import { packLabels, type LabelInput } from "./timeline-labels";

/** 假的量字：一个汉字 10 像素，别的 5 像素。真的那份用 canvas 量。 */
const measure = (text: string) => [...text].reduce((w, c) => w + (/[一-龥]/.test(c) ? 10 : 5), 0);

function item(key: string, x: number, name: string, duration: string): LabelInput {
  return { key, x, full: `${name} ${duration}`, short: name };
}

describe("时间线条下面的字怎么排", () => {
  it("点一律钉在块的左边沿，一像素都不挪", () => {
    const placed = packLabels([item("a", 0, "早饭", "1 小时"), item("b", 40, "西湖", "3 小时")], measure, 300);

    expect(placed.map((p) => p.x)).toEqual([0, 40]);
  });

  it("隔得开就都在第一行", () => {
    const placed = packLabels(
      [item("a", 0, "早饭", "1 小时"), item("b", 120, "午饭", "1 小时"), item("c", 240, "晚饭", "1 小时")],
      measure,
      400,
    );

    expect(placed.map((p) => p.row)).toEqual([0, 0, 0]);
    expect(placed.map((p) => p.at)).toEqual([0, 120, 240]);
  });

  it("挨太近就换行，字还留在自己点的位置", () => {
    const placed = packLabels([item("a", 0, "早饭", "1 小时"), item("b", 20, "西湖", "3 小时")], measure, 300);

    expect(placed.map((p) => p.row)).toEqual([0, 1]);
    expect(placed.map((p) => p.at)).toEqual([0, 20]);
  });

  it("按开始时间先后排，不管给进来的顺序", () => {
    const placed = packLabels([item("b", 20, "西湖", "3 小时"), item("a", 0, "早饭", "1 小时")], measure, 300);

    expect(placed.map((p) => p.key)).toEqual(["a", "b"]);
  });

  it("右边写不下完整的，先去掉时长只留名字", () => {
    // 「夜车 10.2 小时」要 5*10+7*5=85；只写「夜车」要 20。轨道 300，块在 240
    const placed = packLabels([item("a", 240, "夜车", "10.2 小时")], measure, 300);

    expect(placed[0]!.text).toBe("夜车");
    expect(placed[0]!.flip).toBe(false);
    expect(placed[0]!.at).toBe(240);
  });

  it("名字也写不下才翻到点的左边，点还在原处", () => {
    const placed = packLabels([item("a", 290, "夜车去苏州", "10.2 小时")], measure, 300);

    expect(placed[0]!.flip).toBe(true);
    expect(placed[0]!.x).toBe(290);
    // 翻过去以后，字的右端贴着点
    expect(placed[0]!.at + placed[0]!.width).toBeCloseTo(290 + 5, 5);
  });

  it("一整天：六件事排成三行，六个点都对准自己的块", () => {
    const day: LabelInput[] = [
      item("早饭", 14, "早饭", "1 小时"),
      item("西湖", 44, "西湖", "3 小时"),
      item("午饭", 96, "午饭", "1 小时"),
      item("买咖啡", 118, "买咖啡", "20 分钟"),
      item("灵隐寺", 133, "灵隐寺", "3 小时"),
      item("夜车去苏州", 201, "夜车去苏州", "10.2 小时"),
    ];

    const placed = packLabels(day, measure, 279);

    expect(Math.max(...placed.map((p) => p.row)) + 1).toBe(3);
    expect(placed.map((p) => p.x)).toEqual([14, 44, 96, 118, 133, 201]);
  });

  // 宽度＝点和空隙 7 ＋ 字：「西湖 3 小时」62、「西湖」27、「灵隐寺 3 小时」72、「早饭 1 小时」62；同一行两条至少隔 8
  it("写完整会把下一件挤到下一行、只写名字就不会：只写名字", () => {
    // 西湖写完整占到 62，灵隐寺在 50 挤不进；只写「西湖」占到 27，灵隐寺就留在第一行
    const placed = packLabels([item("西湖", 0, "西湖", "3 小时"), item("灵隐寺", 50, "灵隐寺", "3 小时")], measure, 300);

    expect(placed.map((p) => [p.row, p.text])).toEqual([
      [0, "西湖"],
      [0, "灵隐寺 3 小时"],
    ]);
  });

  it("下一件反正挤不进这一行，就照写完整的", () => {
    // 灵隐寺在 20：西湖只写名字也占到 27，照样挤——缩短没用，不缩
    const placed = packLabels([item("西湖", 0, "西湖", "3 小时"), item("灵隐寺", 20, "灵隐寺", "3 小时")], measure, 300);

    expect(placed.map((p) => [p.row, p.text])).toEqual([
      [0, "西湖 3 小时"],
      [1, "灵隐寺 3 小时"],
    ]);
  });

  it("下一件在上面那行放得下，就不用为它缩短", () => {
    // 早饭占 0..62 在第一行；西湖在 10 挤到第二行；灵隐寺在 80 回第一行放得下，所以西湖不用缩
    const placed = packLabels(
      [item("早饭", 0, "早饭", "1 小时"), item("西湖", 10, "西湖", "3 小时"), item("灵隐寺", 80, "灵隐寺", "3 小时")],
      measure,
      300,
    );

    expect(placed.map((p) => [p.row, p.text])).toEqual([
      [0, "早饭 1 小时"],
      [1, "西湖 3 小时"],
      [0, "灵隐寺 3 小时"],
    ]);
  });

  it("一件事都没有就是空的", () => {
    expect(packLabels([], measure, 300)).toEqual([]);
  });
});
