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
 * 照 Things：删了能从「怎么用」再拿一份）。一趟广州三日游，把功能都用上：停留铺满三天、两件并排、
 * 住宿跨午夜、挂着开销、有没排时间的、有一件待定、有一件带备注。
 * 行程排的时候核对过开放时间：陈家祠周二闭馆；南越王墓、省博周一闭馆、要实名预约；珠江夜游晚上约 10 分钟一班。
 * 不挂标签：标签是所有计划共用的，示例别往你的标签里塞东西。
 */
export const SAMPLE_NAME = "示例：广州三日游";

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
  { title: "高铁到广州", kind: "transit", day: 0, at: "09:00", minutes: 120 },
  { title: "烧鹅", kind: "food", day: 0, at: "12:00", minutes: 60 },
  { title: "陈家祠", kind: "sight", day: 0, at: "13:30", minutes: 90 },
  { title: "沙面", kind: "sight", day: 0, at: "15:30", minutes: 120 },
  { title: "下午茶", kind: "food", day: 0, at: "16:30", minutes: 60 },
  { title: "艇仔粥", kind: "food", day: 0, at: "18:00", minutes: 60 },
  { title: "酒店", kind: "lodging", day: 0, at: "20:30", minutes: 11 * 60 },
  { title: "早茶", kind: "food", day: 1, at: "08:00", minutes: 90 },
  { title: "南越王墓", kind: "sight", day: 1, at: "10:00", minutes: 90 },
  { title: "北京路", kind: "shopping", day: 1, at: "12:00", minutes: 120 },
  { title: "煲仔饭", kind: "food", day: 1, at: "18:00", minutes: 60 },
  { title: "珠江夜游", kind: "sight", day: 1, at: "19:30", minutes: 75 },
  { title: "糖水", kind: "food", day: 1, at: "21:00", minutes: 45 },
  { title: "酒店", kind: "lodging", day: 1, at: "22:00", minutes: 9 * 60 + 30 },
  { title: "肠粉", kind: "food", day: 2, at: "08:00", minutes: 45 },
  { title: "广东省博", kind: "sight", day: 2, at: "09:30", minutes: 120 },
  { title: "云吞面", kind: "food", day: 2, at: "12:00", minutes: 45 },
  { title: "广州塔", kind: "sight", day: 2, at: "13:30", minutes: 120 },
  { title: "高铁返程", kind: "transit", day: 2, at: "17:30", minutes: 120 },
];

const MONEY: Array<{ block: string; day: number; title: string; yuan: number }> = [
  { block: "高铁到广州", day: 0, title: "高铁票", yuan: 200 },
  { block: "陈家祠", day: 0, title: "门票", yuan: 20 },
  { block: "酒店", day: 0, title: "房费", yuan: 560 },
  { block: "早茶", day: 1, title: "早茶", yuan: 180 },
  { block: "珠江夜游", day: 1, title: "船票", yuan: 160 },
  { block: "广州塔", day: 2, title: "门票", yuan: 300 },
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

  add({ baseId: baseIds[0]!, kindId: "stay", title: "在广州", minute: 0, duration: 3 * 1440 });
  const ids = new Map<string, string>();
  for (const { title, kind, day, at, minutes } of TIMED) {
    const [hour, minute] = at.split(":").map(Number);
    ids.set(`${day}:${title}`, add({ baseId: baseIds[day]!, kindId: kind, title, minute: hour! * 60 + minute!, duration: minutes }));
  }
  add({ baseId: baseIds[0]!, kindId: "sight", title: "上下九", slot: "evening" });
  add({ baseId: baseIds[2]!, kindId: "shopping", title: "买手信", slot: "day" });

  for (const { block, day, title, yuan } of MONEY) {
    addExpense(plan, library, { title, amountCents: yuan * 100, blockIds: [ids.get(`${day}:${block}`)!] });
  }
  // 夜游看天气再定
  setBlockMark(plan, [ids.get("1:珠江夜游")!], "pending");
  updateBlock(plan, library, ids.get("1:南越王墓")!, { note: "周一闭馆，要在公众号实名预约" });
}
