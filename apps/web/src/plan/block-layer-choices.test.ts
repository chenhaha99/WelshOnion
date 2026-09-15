import {
  addBlock,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  resizeBlock,
  setBlockLayer,
  setDays,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { layerChoices, STACKED } from "./block-layer-choices";

interface Seed {
  title: string;
  kindId?: string;
  /** 没给就是没排时间 */
  minute?: number;
  duration?: number;
  /** 叠到哪件（标题）上 */
  onto?: string;
}

/** 在内存里搭一个 10.1 一天、北京时区的计划，放好这些事；read 读出现在的视图。 */
function build(seeds: readonly Seed[]) {
  const libraryDoc = new Y.Doc();
  initLibraryDoc(libraryDoc);
  const planDoc = new Y.Doc();
  initPlanDoc(planDoc, "p");
  const days = setDays(planDoc, { startDate: "2026-10-01", count: 1, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  const ids: Record<string, string> = {};
  for (const seed of seeds) {
    const result = addBlock(planDoc, libraryDoc, {
      baseId: days.value.baseIds[0]!,
      kindId: seed.kindId ?? "sight",
      title: seed.title,
      ...(seed.minute === undefined ? { slot: "day" as const } : { minute: seed.minute, duration: seed.duration ?? 60 }),
    });
    if (!result.ok) throw new Error("建块失败");
    ids[seed.title] = result.value.blockId;
    if (seed.onto !== undefined) setBlockLayer(planDoc, libraryDoc, result.value.blockId, ids[seed.onto]!);
  }
  /** title 这件事现在「放在哪」的选项：能叠上去的标题、现在选的标题（单独一道是 ""） */
  const choicesOf = (title: string) => {
    const library = readLibrary(libraryDoc);
    const plan = readPlan(planDoc, library);
    const choices = layerChoices(plan, library, plan.blocks.get(ids[title]!)!);
    if (choices === null) return null;
    const current = plan.blocks.get(choices.current)?.title ?? choices.current;
    return { targets: choices.targets.map((block) => block.title), current };
  };
  return { planDoc, ids, choicesOf };
}

describe("「放在哪」的选项", () => {
  it("能叠上去的按开始时刻排；不算自己、跟着它走的、类型层不同的；没存层是单独一道", () => {
    const { choicesOf } = build([
      { title: "午饭", kindId: "food", minute: 720, duration: 60 },
      { title: "横店", minute: 480, duration: 720 },
      { title: "在杭州", kindId: "stay", minute: 0, duration: 1440 },
      { title: "明清宫苑", minute: 600, duration: 240 },
      { title: "拍照", minute: 660, duration: 30, onto: "明清宫苑" },
      { title: "夜游", minute: 1260, duration: 60 },
    ]);

    expect(choicesOf("明清宫苑")).toEqual({ targets: ["横店", "午饭"], current: "" });
  });

  it("叠着时选的是下面那件；有几件时选时长最短的", () => {
    const { choicesOf } = build([
      { title: "横店", minute: 480, duration: 720 },
      { title: "园区", minute: 540, duration: 360 },
      { title: "明清宫苑", minute: 600, duration: 120, onto: "园区" },
    ]);

    expect(choicesOf("明清宫苑")).toEqual({ targets: ["横店", "园区"], current: "园区" });
  });

  it("存了层却找不到下面那件：叠着", () => {
    const { planDoc, ids, choicesOf } = build([
      { title: "横店", minute: 480, duration: 240 },
      { title: "明清宫苑", minute: 600, duration: 120, onto: "横店" },
    ]);
    resizeBlock(planDoc, ids["横店"]!, 60);

    expect(choicesOf("明清宫苑")).toEqual({ targets: [], current: STACKED });
  });

  it("没排时间的、没有能叠上去又没存层的：不出这一栏", () => {
    const { choicesOf } = build([{ title: "河坊街" }, { title: "西湖", minute: 540, duration: 180 }]);

    expect(choicesOf("河坊街")).toBeNull();
    expect(choicesOf("西湖")).toBeNull();
  });
});
