import {
  addBlock,
  addExpense,
  setBlockMark,
  setDays,
  setPlanSettings,
  updateBlock,
  type AddBlockInput,
} from "@welshonion/core";
import type * as Y from "yjs";

/**
 * 示例计划（照 Final Cut Pro 的演示项目：一个完整的真实工程，自己去拿、拿到了和普通项目一样能改；
 * 照 Things：删了能从「怎么用」再拿一份）。一趟杭州三日游，把功能都用上：停留铺满三天、两件并排、
 * 住宿跨午夜、挂着开销、有没排时间的、有一件待定。不挂标签：标签是所有计划共用的，示例别往你的标签里塞东西。
 */
export const SAMPLE_NAME = "示例：杭州三日游";

/** 名字以「示例：」开头的算示例计划，卡片上挂「示例」角标；你改了名就不算了（AI 推的：不为它加数据字段） */
export function isSamplePlan(plan: { name: string }): boolean {
  return plan.name.startsWith("示例：");
}

/** 从下周开始：首页「下一趟」会是它，打开就看得到倒计时 */
export function sampleStartDate(today: string): string {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 7);
  return date.toISOString().slice(0, 10);
}

type Timed = { title: string; kind: string; day: number; at: string; minutes: number };

const TIMED: Timed[] = [
  { title: "高铁到杭州", kind: "transit", day: 0, at: "08:00", minutes: 75 },
  { title: "西湖", kind: "sight", day: 0, at: "10:00", minutes: 180 },
  { title: "午饭", kind: "food", day: 0, at: "12:30", minutes: 60 },
  { title: "灵隐寺", kind: "sight", day: 0, at: "14:30", minutes: 150 },
  { title: "晚饭", kind: "food", day: 0, at: "18:30", minutes: 90 },
  { title: "湖边民宿", kind: "lodging", day: 0, at: "21:00", minutes: 12 * 60 },
  { title: "千岛湖一日游", kind: "sight", day: 1, at: "09:30", minutes: 8 * 60 },
  { title: "晚饭", kind: "food", day: 1, at: "18:30", minutes: 90 },
  { title: "湖边民宿", kind: "lodging", day: 1, at: "21:00", minutes: 12 * 60 },
  { title: "龙井村", kind: "sight", day: 2, at: "09:30", minutes: 150 },
  { title: "午饭", kind: "food", day: 2, at: "12:00", minutes: 60 },
  { title: "回程高铁", kind: "transit", day: 2, at: "15:00", minutes: 75 },
];

const MONEY: Array<{ block: string; day: number; title: string; yuan: number }> = [
  { block: "高铁到杭州", day: 0, title: "高铁票", yuan: 146 },
  { block: "西湖", day: 0, title: "游船", yuan: 110 },
  { block: "灵隐寺", day: 0, title: "门票", yuan: 150 },
  { block: "晚饭", day: 0, title: "楼外楼", yuan: 360 },
  { block: "湖边民宿", day: 0, title: "房费", yuan: 680 },
  { block: "千岛湖一日游", day: 1, title: "一日游团费", yuan: 560 },
];

/** 往一个刚建好的空计划里写示例内容（名字、两个人、三天、这些事和开销）。 */
export function writeSamplePlan(plan: Y.Doc, library: Y.Doc, { startDate, tz }: { startDate: string; tz: string }): void {
  plan.getMap("plan").set("name", SAMPLE_NAME);
  setPlanSettings(plan, { traveler_count: 2 });
  const days = setDays(plan, { startDate, count: 3, tz });
  if (!days.ok) throw new Error("示例计划建天失败");
  const baseIds = days.value.baseIds;
  const add = (input: AddBlockInput) => {
    const added = addBlock(plan, library, input);
    if (!added.ok) throw new Error(`示例计划建「${input.title}」失败`);
    return added.value.blockId;
  };

  add({ baseId: baseIds[0]!, kindId: "stay", title: "在杭州", minute: 0, duration: 3 * 1440 });
  const ids = new Map<string, string>();
  for (const { title, kind, day, at, minutes } of TIMED) {
    const [hour, minute] = at.split(":").map(Number);
    ids.set(`${day}:${title}`, add({ baseId: baseIds[day]!, kindId: kind, title, minute: hour! * 60 + minute!, duration: minutes }));
  }
  add({ baseId: baseIds[1]!, kindId: "sight", title: "河坊街", slot: "evening" });
  add({ baseId: baseIds[2]!, kindId: "shopping", title: "买伴手礼", slot: "day" });

  for (const { block, day, title, yuan } of MONEY) {
    addExpense(plan, library, { title, amountCents: yuan * 100, blockIds: [ids.get(`${day}:${block}`)!] });
  }
  setBlockMark(plan, [ids.get("1:千岛湖一日游")!], "pending");
  updateBlock(plan, library, ids.get("0:灵隐寺")!, { note: "飞来峰门票 45，灵隐寺香花券另买 30" });
}
