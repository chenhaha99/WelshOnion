import {
  addBlock,
  addExpense,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setDays,
  updateBlock,
  type AddBlockInput,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { searchPlan } from "./plan-search";

interface Builder {
  days: string[];
  /** 建一件事：给了 minute 就排上时间（时长默认 60 分钟），不给就是没排时间的整天 */
  block: (dayIndex: number, title: string, time?: { minute: number; duration?: number }) => string;
  notes: (blockId: string, notes: { subtitle?: string; note?: string }) => void;
  expense: (title: string, blockIds: string[]) => void;
}

/** 在内存里搭一个 10.1 起三天、北京时区的计划，按需放事、备注、开销，返回读出来的计划视图。 */
function planWith(setup: (build: Builder) => void): PlanView {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");

  setup({
    days: days.value.baseIds,
    block: (dayIndex, title, time) => {
      const input: AddBlockInput =
        time === undefined
          ? { baseId: days.value.baseIds[dayIndex]!, kindId: "sight", title, slot: "day" }
          : {
              baseId: days.value.baseIds[dayIndex]!,
              kindId: "sight",
              title,
              minute: time.minute,
              duration: time.duration ?? 60,
            };
      const added = addBlock(plan, library, input);
      if (!added.ok) throw new Error("建块失败");
      return added.value.blockId;
    },
    notes: (blockId, notes) => {
      const result = updateBlock(plan, library, blockId, notes);
      if (!result.ok) throw new Error("改备注失败");
    },
    expense: (title, blockIds) => {
      const added = addExpense(plan, library, { title, amountCents: 1000, blockIds, basis: "total" });
      if (!added.ok) throw new Error("建开销失败");
    },
  });
  return readPlan(plan, readLibrary(library));
}

function titles(plan: PlanView, query: string): string[] {
  return searchPlan(plan, query).map((hit) => hit.block.title);
}

describe("搜什么", () => {
  it("搜标题", () => {
    const plan = planWith(({ block }) => {
      block(0, "西湖", { minute: 540 });
      block(0, "西湖醋鱼", { minute: 720 });
      block(1, "灵隐寺", { minute: 540 });
    });

    expect(titles(plan, "西湖")).toEqual(["西湖", "西湖醋鱼"]);
  });

  it("搜短备注和长备注", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "灵隐寺", { minute: 540 }), { note: "记得带伞" });
      notes(block(1, "西湖", { minute: 540 }), { subtitle: "坐船" });
    });

    expect(titles(plan, "带伞")).toEqual(["灵隐寺"]);
    expect(titles(plan, "坐船")).toEqual(["西湖"]);
  });

  it("搜挂在事上的开销说明；一笔挂两件，两件都算", () => {
    const plan = planWith(({ block, expense }) => {
      const hengdian = block(0, "横店", { minute: 480, duration: 720 });
      const palace = block(0, "明清宫苑", { minute: 600 });
      block(1, "午饭", { minute: 720 });
      expense("通票", [hengdian, palace]);
    });

    expect(titles(plan, "通票")).toEqual(["横店", "明清宫苑"]);
  });

  it("不挂在任何事上的开销不算", () => {
    const plan = planWith(({ block, expense }) => {
      block(0, "西湖", { minute: 540 });
      expense("签证", []);
    });

    expect(titles(plan, "签证")).toEqual([]);
  });

  it("几个词都要有，不必在同一样里", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "西湖", { minute: 540 }), { subtitle: "坐船" });
    });

    expect(titles(plan, "西湖 坐船")).toEqual(["西湖"]);
    expect(titles(plan, "西湖 爬山")).toEqual([]);
  });

  it("不分大小写", () => {
    const plan = planWith(({ block }) => {
      block(0, "Disney 乐园", { minute: 540 });
    });

    expect(titles(plan, "disney")).toEqual(["Disney 乐园"]);
    expect(titles(plan, "DISNEY 乐园")).toEqual(["Disney 乐园"]);
  });

  it("只有空格不出结果", () => {
    const plan = planWith(({ block }) => {
      block(0, "西湖", { minute: 540 });
    });

    expect(titles(plan, "")).toEqual([]);
    expect(titles(plan, "   ")).toEqual([]);
  });
});

describe("结果怎么列", () => {
  it("按列表视图的顺序：按天，排了时间的在前，没排时间的在那天最后", () => {
    const plan = planWith(({ block }) => {
      block(1, "西湖夜游", { minute: 1140 });
      block(0, "西湖边喝茶");
      block(0, "西湖", { minute: 540 });
    });

    expect(titles(plan, "西湖")).toEqual(["西湖", "西湖边喝茶", "西湖夜游"]);
  });

  it("跨午夜的只在开始那天出现一次", () => {
    const plan = planWith(({ block }) => {
      block(0, "夜宵", { minute: 1380, duration: 180 });
    });

    expect(titles(plan, "夜宵")).toEqual(["夜宵"]);
  });

  it("写在哪天、什么时间；没排时间的写「没排时间」", () => {
    const plan = planWith(({ block }) => {
      block(0, "西湖", { minute: 540 });
      block(0, "西湖边喝茶");
    });

    expect(searchPlan(plan, "西湖").map((hit) => hit.where)).toEqual([
      "第 1 天 · 10.1 周四 · 09:00–10:00",
      "第 1 天 · 10.1 周四 · 没排时间",
    ]);
  });

  it("标题里缺的词在备注里：写前后各 12 个字的一小段，被截掉的一边加「…」", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "灵隐寺", { minute: 540 }), {
        note: "从北门进去，早上八点以前人少，记得带伞，门口有存包的柜子，出来往东走十分钟就是龙井村",
      });
    });

    expect(searchPlan(plan, "带伞")[0]!.snippet).toEqual({
      label: "备注",
      text: "…，早上八点以前人少，记得带伞，门口有存包的柜子，出来…",
    });
  });

  it("离开头不到 12 个字时前面不加「…」", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "灵隐寺", { minute: 540 }), { subtitle: "记得带伞" });
    });

    expect(searchPlan(plan, "带伞")[0]!.snippet).toEqual({ label: "备注", text: "记得带伞" });
  });

  it("缺的词在开销说明里，写「开销」", () => {
    const plan = planWith(({ block, expense }) => {
      expense("横店通票", [block(0, "横店", { minute: 480 })]);
    });

    expect(searchPlan(plan, "通票")[0]!.snippet).toEqual({ label: "开销", text: "横店通票" });
  });

  it("标题里有全部的词，就不写一小段", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "西湖", { minute: 540 }), { subtitle: "西湖坐船" });
    });

    expect(searchPlan(plan, "西湖")[0]!.snippet).toBeNull();
  });

  it("只找标题里缺的那个词：「西湖 坐船」在「西湖」上，片段围着「坐船」", () => {
    const plan = planWith(({ block, notes }) => {
      notes(block(0, "西湖", { minute: 540 }), { note: "先去断桥，西湖边上等一会儿再坐船" });
    });

    expect(searchPlan(plan, "西湖 坐船")[0]!.snippet).toEqual({
      label: "备注",
      text: "…断桥，西湖边上等一会儿再坐船",
    });
  });
});
