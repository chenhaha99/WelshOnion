import {
  addBlock,
  addDayInTz,
  initLibraryDoc,
  initPlanDoc,
  readLibrary,
  readPlan,
  setDayTz,
  setDays,
  type PlanView,
} from "@welshonion/core";
import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { zoneTimeLabel } from "./zone-time";

interface Built {
  plan: Y.Doc;
  library: Y.Doc;
  /** 底座 id，按建的先后 */
  days: string[];
}

/** 在内存里搭一个从 10.1 起、北京时区的计划，按需加时区、放块，返回读出来的视图。 */
function build(dayCount: number, setup: (built: Built) => void): PlanView {
  const library = new Y.Doc();
  initLibraryDoc(library);
  const plan = new Y.Doc();
  initPlanDoc(plan, "p");
  const days = setDays(plan, { startDate: "2026-10-01", count: dayCount, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  setup({ plan, library, days: days.value.baseIds });
  return readPlan(plan, readLibrary(library));
}

function addTz(built: Built, afterDay: number, tz: string): void {
  const added = addDayInTz(built.plan, built.days[afterDay]!, tz);
  if (!added.ok) throw new Error("加时区失败");
  built.days.push(added.value.baseId);
}

function timed(built: Built, title: string, minute: number, duration: number): void {
  const result = addBlock(built.plan, built.library, { baseId: built.days[0]!, kindId: "transit", title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
}

function labelOf(plan: PlanView, title: string): string | null {
  const block = [...plan.blocks.values()].find((item) => item.title === title);
  if (!block) throw new Error(`没有「${title}」`);
  return zoneTimeLabel(plan, block);
}

describe("跨时区的时间写两地的时刻", () => {
  it("北京飞洛杉矶：落在洛杉矶那一行，写当地 15:00", () => {
    const plan = build(1, (built) => {
      addTz(built, 0, "America/Los_Angeles");
      timed(built, "飞洛杉矶", 1080, 720);
    });
    expect(labelOf(plan, "飞洛杉矶")).toBe("北京 18:00 → 洛杉矶 15:00");
  });

  it("落地的当地日期不是出发那天：落地前面加月.日", () => {
    const plan = build(2, (built) => {
      const tokyo = setDayTz(built.plan, built.days[1]!, "Asia/Tokyo");
      if (!tokyo.ok) throw new Error("改时区失败");
      timed(built, "飞东京", 1380, 180);
    });
    expect(labelOf(plan, "飞东京")).toBe("北京 23:00 → 东京 10.2 03:00");
  });

  it("画到最后一行还没完：按最后一行的时区算落地时刻", () => {
    const plan = build(1, (built) => {
      addTz(built, 0, "America/Los_Angeles");
      timed(built, "长途", 1080, 2880);
    });
    expect(labelOf(plan, "长途")).toBe("北京 18:00 → 洛杉矶 10.3 03:00");
  });

  it("全程一个时区（跨午夜也一样）、没排时间、时长为 0：不用两地写法", () => {
    const sameZone = build(2, (built) => timed(built, "酒店", 1320, 600));
    expect(labelOf(sameZone, "酒店")).toBeNull();

    const other = build(1, (built) => {
      addTz(built, 0, "America/Los_Angeles");
      timed(built, "出发", 1200, 0);
      const undated = addBlock(built.plan, built.library, { baseId: built.days[0]!, kindId: "sight", title: "西湖", slot: "day" });
      if (!undated.ok) throw new Error("建块失败");
    });
    expect(labelOf(other, "出发")).toBeNull();
    expect(labelOf(other, "西湖")).toBeNull();
  });
});
