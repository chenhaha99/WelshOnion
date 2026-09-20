import {
  addBlock,
  addExpense,
  initLibraryDoc,
  initPlanDoc,
  moneySummary,
  readLibrary,
  readPlan,
  setBlockMark,
  setDays,
  setPlanSettings,
  updateBlock,
  type PlanView,
  type StatsFilter,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { dayRowLabels } from "./day-labels";
import { moneyCells } from "./money-cells";
import { overviewDays, type OverviewRow } from "./overview-days";

interface Built {
  plan: Y.Doc;
  library: Y.Doc;
  oct1: string;
  oct2: string;
}

/** 在内存里搭 10.1、10.2 两天的计划，按需放块和开销，返回读出来的视图。 */
function build(setup: (built: Built) => void): PlanView {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: 2, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  setup({ plan, library, oct1: days.value.baseIds[0]!, oct2: days.value.baseIds[1]! });
  return readPlan(plan, readLibrary(library));
}

function timed(built: Built, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(built.plan, built.library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function money(built: Built, cents: number | null, blockIds: string[], extra: { kindId?: string; basis?: "per_person" } = {}) {
  const result = addExpense(built.plan, built.library, { title: "钱", amountCents: cents, blockIds, ...extra });
  if (!result.ok) throw new Error("建开销失败");
}

/**
 * 规格「两天的行程」：3 人。10.1 西湖 ¥300、午饭一笔没填、开车去乌镇 130 公里、民宿、没排时间的灵隐寺 1.5 小时；
 * 10.2 乌镇人均 ¥150、划掉了；签证 ¥600 不挂块。
 */
function trip(more?: (built: Built, ids: { lake: string }) => void): PlanView {
  return build((built) => {
    if (!setPlanSettings(built.plan, { traveler_count: 3 }).ok) throw new Error("改人数失败");
    const lake = timed(built, built.oct1, "西湖", "sight", 540, 180);
    money(built, 30000, [lake]);
    money(built, null, [timed(built, built.oct1, "午饭", "food", 690, 60)]);
    const drive = timed(built, built.oct1, "去乌镇", "transit", 840, 120);
    if (!updateBlock(built.plan, built.library, drive, { transport_mode: "drive", distance_m: 130000 }).ok) {
      throw new Error("改交通失败");
    }
    timed(built, built.oct1, "民宿", "lodging", 1200, 600);
    const temple = addBlock(built.plan, built.library, {
      baseId: built.oct1,
      kindId: "sight",
      title: "灵隐寺",
      slot: "day",
      duration: 90,
    });
    if (!temple.ok) throw new Error("建块失败");
    const wuzhen = timed(built, built.oct2, "乌镇", "sight", 540, 480);
    money(built, 15000, [wuzhen], { basis: "per_person" });
    if (!setBlockMark(built.plan, [wuzhen], "struck").ok) throw new Error("划掉失败");
    money(built, 60000, []);
    more?.(built, { lake });
  });
}

function rows(plan: PlanView, filter?: StatsFilter, today = "2026-09-18") {
  const labels = dayRowLabels(plan.bases);
  return overviewDays(plan, moneyCells(plan, filter), labels, today, filter);
}

/** 表里一行写的字：没有的项是 null。 */
function cells(row: OverviewRow) {
  const { label, isToday, span, busy, drive, unscheduled, money, unfilled, blocks } = row;
  return { label, isToday, span, busy, drive, unscheduled, money, unfilled, blocks };
}

describe("每天一行", () => {
  it("两天的行程", () => {
    const { days } = rows(trip());
    expect(days.map(cells)).toEqual([
      {
        label: "第 1 天 · 10.1 周四",
        isToday: false,
        span: "09:00–16:00",
        busy: "5.5 小时",
        drive: "2 小时 130 公里",
        unscheduled: "1.5 小时",
        money: "¥300",
        unfilled: "1 笔没填",
        blocks: "5 件",
      },
      {
        label: "第 2 天 · 10.2 周五",
        isToday: false,
        span: "09:00–17:00",
        busy: "8 小时",
        drive: null,
        unscheduled: null,
        money: "¥450",
        unfilled: null,
        blocks: "1 件 · 划掉 1",
      },
    ]);
  });

  it("细条：花得最多的那天满格，别的按比例", () => {
    const { days, extra, total } = rows(trip());
    expect(days.map((day) => day.share)).toEqual([30000 / 45000, 1]);
    expect(extra.map((row) => row.share)).toEqual([null]);
    expect(total.share).toBeNull();
  });

  it("没填金额的那天不画细条", () => {
    const plan = build((built) => {
      money(built, 30000, [timed(built, built.oct1, "西湖", "sight", 540, 180)]);
      money(built, null, [timed(built, built.oct2, "乌镇", "sight", 540, 480)]);
    });
    expect(rows(plan).days.map((day) => day.share)).toEqual([1, null]);
  });

  it("一分钱都没花时不画细条", () => {
    const plan = build((built) => {
      timed(built, built.oct1, "西湖", "sight", 540, 180);
    });
    expect(rows(plan).days.map((day) => day.share)).toEqual([null, null]);
  });

  it("只有没填的开销：只写几笔没填", () => {
    const plan = build((built) => {
      money(built, null, [timed(built, built.oct1, "西湖", "sight", 540, 180)]);
    });
    const [oct1] = rows(plan).days;
    expect([oct1!.money, oct1!.unfilled]).toEqual([null, "1 笔没填"]);
  });

  it("手机上第二行：写法同「这天怎么样」，再加排了、几件", () => {
    const { days } = rows(trip());
    expect(days[0]!.line).toEqual([
      "09:00 起",
      "16:00 收工",
      "排了 5.5 小时",
      "自驾 2 小时 130 公里",
      "还有 1.5 小时没排",
      "1 笔没填",
      "5 件",
    ]);
    expect(days[1]!.line).toEqual(["09:00 起", "17:00 收工", "排了 8 小时", "1 件 · 划掉 1"]);
  });

  it("今天", () => {
    const { days } = rows(trip(), undefined, "2026-10-02");
    expect(days.map((day) => day.isToday)).toEqual([false, true]);
  });
});

describe("最后几行", () => {
  it("不属于任何一天、合计：花的合计是开销总览的总额", () => {
    const plan = trip();
    const { extra, total } = rows(plan);
    expect(extra.map(cells)).toEqual([
      {
        label: "不属于任何一天",
        isToday: false,
        span: null,
        busy: null,
        drive: null,
        unscheduled: null,
        money: "¥600",
        unfilled: null,
        blocks: null,
      },
    ]);
    expect(cells(total)).toEqual({
      label: "合计",
      isToday: false,
      span: null,
      busy: "13.5 小时",
      drive: "2 小时 130 公里",
      unscheduled: "1.5 小时",
      money: "¥1,350",
      unfilled: "1 笔没填",
      blocks: "6 件 · 划掉 1",
    });
    expect(moneySummary(plan).totalCents).toBe(135000);
    expect(total.line).toEqual(["排了 13.5 小时", "自驾 2 小时 130 公里", "还有 1.5 小时没排", "1 笔没填", "6 件 · 划掉 1"]);
  });

  it("没有不挂块的开销：没有「不属于任何一天」", () => {
    const plan = build((built) => {
      money(built, 30000, [timed(built, built.oct1, "西湖", "sight", 540, 180)]);
    });
    expect(rows(plan).extra).toEqual([]);
  });
});

describe("跟着筛选", () => {
  it("只看没划掉的：划掉的那天空着", () => {
    const filter: StatsFilter = { marks: ["pending", "decided"] };
    const { days, total } = rows(trip(), filter);
    expect(cells(days[1]!)).toEqual({
      label: "第 2 天 · 10.2 周五",
      isToday: false,
      span: null,
      busy: null,
      drive: null,
      unscheduled: null,
      money: null,
      unfilled: null,
      blocks: null,
    });
    expect([total.money, total.blocks]).toEqual(["¥900", "5 件"]);
  });

  it("按类型筛：挂在被筛掉的事上的钱单写一行，合计对得上总额", () => {
    const filter: StatsFilter = { kindIds: ["lodging"] };
    const plan = trip((built, { lake }) => money(built, 20000, [lake], { kindId: "lodging" }));
    const { days, extra, total } = rows(plan, filter);
    expect(days[0]!.money).toBeNull();
    expect(extra.map((row) => [row.label, row.money])).toEqual([["挂在被筛掉的事上", "¥200"]]);
    expect(total.money).toBe("¥200");
    expect(moneySummary(plan, filter).totalCents).toBe(20000);
  });
});
