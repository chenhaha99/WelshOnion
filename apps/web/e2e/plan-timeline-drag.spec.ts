import { expect, test, type Locator, type Page } from "@playwright/test";
import { shot, watchErrors } from "./walkthrough";

const DAY1 = /10\.1 周四 的安排/;
const DAY2 = /10\.2 周五 的安排/;
const DAY3 = /10\.3 周六 的安排/;

interface Point {
  x: number;
  y: number;
}

async function newPlan(page: Page, dayCount = 2): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill(String(dayCount));
  await page.getByRole("button", { name: "确定" }).click();
  await expect(page.getByRole("list", { name: "日期列表" }).getByRole("listitem")).toHaveCount(dayCount);
}

async function addBlocks(page: Page, table: Locator, titles: string[]): Promise<void> {
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of titles) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
}

/** 安排表里标题是 title 的那一行。排时间会改变行的先后，所以按标题找到块 id 再定位。 */
async function rowOf(table: Locator, title: string): Promise<Locator> {
  const id = await table
    .locator("tr[data-block-id]")
    .evaluateAll(
      (rows, wanted) =>
        rows
          .find((row) => row.querySelector<HTMLInputElement>('input[aria-label="标题"]')?.value === wanted)
          ?.getAttribute("data-block-id") ?? null,
      title,
    );
  if (id === null) throw new Error(`表里没有「${title}」`);
  return table.locator(`tr[data-block-id="${id}"]`);
}

async function timeOf(table: Locator, title: string): Promise<string> {
  return (await rowOf(table, title)).locator("[data-block-time]").innerText();
}

async function pickKind(page: Page, table: Locator, title: string, kind: string): Promise<void> {
  await (await rowOf(table, title)).getByRole("button", { name: /^类型：/ }).click();
  // 选项旁边有「「住宿」的操作」按钮，按名字找选项要精确匹配
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
}

async function schedule(page: Page, table: Locator, title: string, start: string, hours: string, minutes = "0") {
  await (await rowOf(table, title)).getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: `${title} 的时间` });
  await editor.getByLabel("开始").fill(start);
  await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
  await editor.getByRole("spinbutton", { name: "分钟" }).fill(minutes);
  await editor.getByRole("button", { name: "排上时间" }).click();
  await expect(editor).toBeHidden();
}

function timelineRow(page: Page, day: "10.1" | "10.2" | "10.3"): Locator {
  return page.getByRole("region", { name: "时间轴" }).getByRole("listitem", { name: new RegExp(day.replace(".", "\\.")) });
}

/** 时间轴这一行里读屏名以「title 」开头的那段横条的外框。 */
function segment(row: Locator, title: string): Locator {
  return row.locator("[data-segment]").filter({ has: row.page().getByRole("button", { name: new RegExp(`^${title} `) }) });
}

/**
 * 量时间轴里某个元素在屏幕上的位置。先把整张时间轴滚进屏幕：在下面的安排表里点过以后页面会往下滚，
 * 时间轴跑到屏幕上面，量出来的点在屏幕外，鼠标按下去什么都收不到。整张卡片一次滚好，前后量的几个点才对得上。
 */
async function box(locator: Locator) {
  await locator.page().getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  const found = await locator.boundingBox();
  if (!found) throw new Error("量不到位置");
  return found;
}

function center(rect: { x: number; y: number; width: number; height: number }): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

/** 这一行的横轴上，1 小时有多少像素。 */
async function hourWidth(row: Locator): Promise<number> {
  return (await box(row.locator("[data-timeline-axis]"))).width / 24;
}

/** 用鼠标从 from 拖到 to（分几步移动，会越过 4 像素的门槛）；release 为 false 时停在终点不松手。 */
async function drag(page: Page, from: Point, to: Point, options: { alt?: boolean; release?: boolean } = {}) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  if (options.alt) await page.keyboard.down("Alt");
  await page.mouse.move(to.x, to.y, { steps: 8 });
  if (options.release === false) return;
  await page.mouse.up();
  if (options.alt) await page.keyboard.up("Alt");
}

test("拖中间：点一下开详情 → 预览 → 挪 → 撤销重做 → 吸附 → 换天 → 过 24 点 → 拖跨午夜的后半段", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1Table, ["西湖", "夜宵", "民宿"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "夜宵", "22:00", "1");
  await pickKind(page, day1Table, "民宿", "住宿");
  await schedule(page, day1Table, "民宿", "22:00", "10");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const hour = await hourWidth(day1);
  const ghost = page.locator("[data-drag-ghost]");

  // 点一下：打开详情
  const lake = center(await box(segment(day1, "西湖")));
  await page.mouse.click(lake.x, lake.y);
  await expect(page.getByRole("dialog", { name: "西湖" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "西湖" })).toBeHidden();

  // 往右拖 1 小时、先不松手：预览写着松手后的时间，原来的横条变淡，表里还没变
  await drag(page, lake, { x: lake.x + hour, y: lake.y }, { release: false });
  await expect(ghost.first()).toHaveText("10:00–13:00");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-dragging", "true");
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–12:00");
  await shot(page, "01-dragging");
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect(ghost).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "西湖" })).toHaveCount(0);

  // 一次拖拽一步撤销
  await page.keyboard.press("Control+z");
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("09:00–12:00");
  await page.keyboard.press("Control+Shift+z");
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await page.keyboard.press("Control+z");
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("09:00–12:00");

  // 吸附到 15 分钟：拖 50 分钟落在 09:45
  const lakeAgain = center(await box(segment(day1, "西湖")));
  await drag(page, lakeAgain, { x: lakeAgain.x + (50 / 60) * hour, y: lakeAgain.y });
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("09:45–12:45");

  // 换天：拖到 10.2 那一行、横向不动
  const lakeNow = center(await box(segment(day1, "西湖")));
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  await drag(page, lakeNow, { x: lakeNow.x, y: day2Axis.y + day2Axis.height - 8 });
  await expect.poll(() => timeOf(day2Table, "西湖")).toBe("09:45–12:45");

  // 过 24 点：夜宵 22:00 往右拖 3 小时，落到 10.2 01:00
  const supper = center(await box(segment(day1, "夜宵")));
  await drag(page, supper, { x: supper.x + 3 * hour, y: supper.y });
  await expect.poll(() => timeOf(day2Table, "夜宵")).toBe("01:00–02:00");

  // 拖跨午夜的块的后半段：整块一起挪
  const innMorning = center(await box(segment(day2, "民宿")));
  await drag(page, innMorning, { x: innMorning.x + hour, y: innMorning.y });
  await expect.poll(() => timeOf(day1Table, "民宿")).toBe("23:00–10.2 09:00");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "02-after-moves");

  expect(errors).toEqual([]);
});

// 规格里几个场景各放一天：放在同一天会互相挡住（叠上去的块会画到时长短的那个外层块上，盖住它的端点）
test("拖两端：左端时里面的块不动 → 右端 → 左端拖过右端 → 窄块只能挪", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  const day3Table = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, day1Table, ["横店", "明清宫苑"]);
  await schedule(page, day1Table, "横店", "08:00", "12");
  await schedule(page, day1Table, "明清宫苑", "10:00", "2");
  await addBlocks(page, day2Table, ["西湖"]);
  await schedule(page, day2Table, "西湖", "09:00", "3");
  await addBlocks(page, day3Table, ["游船", "看潮"]);
  await schedule(page, day3Table, "游船", "10:00", "1");
  await schedule(page, day3Table, "看潮", "12:00", "0", "15");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const day3 = timelineRow(page, "10.3");
  const hour = await hourWidth(day1);

  // 先把明清宫苑叠到横店上
  const palace = center(await box(segment(day1, "明清宫苑")));
  const hengdian = await box(segment(day1, "横店"));
  await drag(page, palace, { x: palace.x, y: hengdian.y + hengdian.height / 2 });
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-depth", "1");

  // 拖左端：横店往右 1 小时，里面的明清宫苑不动
  const hd = await box(segment(day1, "横店"));
  const leftEdge = { x: hd.x + 3, y: hd.y + hd.height / 2 };
  await drag(page, leftEdge, { x: leftEdge.x + hour, y: leftEdge.y });
  await expect.poll(() => timeOf(day1Table, "横店")).toBe("09:00–20:00");
  expect(await timeOf(day1Table, "明清宫苑")).toBe("10:00–12:00");

  // 拖右端：西湖往右 1 小时
  const lk = await box(segment(day2, "西湖"));
  const rightEdge = { x: lk.x + lk.width - 3, y: lk.y + lk.height / 2 };
  await drag(page, rightEdge, { x: rightEdge.x + hour, y: rightEdge.y });
  await expect.poll(() => timeOf(day2Table, "西湖")).toBe("09:00–13:00");

  // 左端拖过右端：游船 10:00 起 1 小时，往右拖 2 小时，变成 11:00 的竖线
  const boat = await box(segment(day3, "游船"));
  const boatLeft = { x: boat.x + 3, y: boat.y + boat.height / 2 };
  await drag(page, boatLeft, { x: boatLeft.x + 2 * hour, y: boatLeft.y });
  await expect.poll(() => timeOf(day3Table, "游船")).toBe("11:00");
  await expect(day3.getByRole("button", { name: "游船 11:00" })).toBeVisible();

  // 窄的块只能挪：看潮 12:00 起 15 分钟，按住最左边往右拖 1 小时
  const tide = await box(segment(day3, "看潮"));
  expect(tide.width).toBeLessThan(24);
  const tideLeft = { x: tide.x + 1, y: tide.y + tide.height / 2 };
  await drag(page, tideLeft, { x: tideLeft.x + hour, y: tideLeft.y });
  await expect.poll(() => timeOf(day3Table, "看潮")).toBe("13:00–13:15");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "01-edges");

  expect(errors).toEqual([]);
});

test("叠上去还是放旁边：描边 → 叠上去 → 放旁边 → 类型层不同的不算 → 带着里面的块走", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["横店", "明清宫苑", "午饭", "在杭州"]);
  await schedule(page, day1Table, "横店", "08:00", "12");
  await schedule(page, day1Table, "明清宫苑", "10:00", "2");
  await pickKind(page, day1Table, "午饭", "餐饮");
  await schedule(page, day1Table, "午饭", "12:00", "1");
  await pickKind(page, day1Table, "在杭州", "停留");
  await schedule(page, day1Table, "在杭州", "00:00", "48");
  const day1 = timelineRow(page, "10.1");
  const hour = await hourWidth(day1);
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-lane", "2");

  // 叠上去：拖到横店的横条上，拖的时候横店描边
  const palace = center(await box(segment(day1, "明清宫苑")));
  const hengdian = await box(segment(day1, "横店"));
  await drag(page, palace, { x: palace.x, y: hengdian.y + hengdian.height / 2 }, { release: false });
  await expect(segment(day1, "横店")).toHaveAttribute("data-drop-target", "true");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "01-drop-onto");
  await page.mouse.up();
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-lane", "1");
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-depth", "1");

  // 放旁边：拖到第 2 道的空白处（午饭那一道，10:00–12:00 这段是空的），没有块描边
  const nested = center(await box(segment(day1, "明清宫苑")));
  const lunch = await box(segment(day1, "午饭"));
  await drag(page, nested, { x: nested.x, y: lunch.y + lunch.height / 2 }, { release: false });
  await expect(day1.locator('[data-drop-target="true"]')).toHaveCount(0);
  await page.mouse.up();
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-depth", "0");
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-lane", "2");

  // 类型层不同的不算叠上去：午饭拖到在杭州（停留）的背景条上
  const lunchNow = center(await box(segment(day1, "午饭")));
  const stay = await box(segment(day1, "在杭州"));
  await drag(page, lunchNow, { x: lunchNow.x, y: stay.y + stay.height / 2 }, { release: false });
  await expect(segment(day1, "在杭州")).not.toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  await expect(segment(day1, "午饭")).toHaveAttribute("data-depth", "0");
  expect(await timeOf(day1Table, "午饭")).toBe("12:00–13:00");

  // 带着里面的块走：先把明清宫苑叠回横店，再按住横店 17:00 那里拖，明清宫苑描出来
  const palaceAgain = center(await box(segment(day1, "明清宫苑")));
  const hengdianAgain = await box(segment(day1, "横店"));
  await drag(page, palaceAgain, { x: palaceAgain.x, y: hengdianAgain.y + hengdianAgain.height / 2 });
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-depth", "1");
  const hd = await box(segment(day1, "横店"));
  const grab = { x: hd.x + hd.width * 0.75, y: hd.y + hd.height / 2 };
  await drag(page, grab, { x: grab.x + hour / 2, y: grab.y }, { release: false });
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-follower", "true");
  await page.mouse.move(grab.x + hour, grab.y, { steps: 4 });
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "横店")).toBe("09:00–21:00");
  expect(await timeOf(day1Table, "明清宫苑")).toBe("11:00–13:00");

  expect(errors).toEqual([]);
});

test("按住 Alt 复制 → Esc 放弃 → 拖的时候块没了", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1Table, ["西湖", "灵隐寺"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await (await rowOf(day1Table, "西湖")).getByRole("button", { name: "钱" }).click();
  await page.getByRole("group", { name: "西湖 的钱" }).getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect((await rowOf(day1Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const hour = await hourWidth(day1);
  const ghost = page.locator("[data-drag-ghost]");

  // 按住 Alt 拖到 10.2：预览写「复制 · 」，松手后原来的不动，10.2 多一个，钱也复制成新的一笔
  const lake = center(await box(segment(day1, "西湖")));
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  await drag(page, lake, { x: lake.x, y: day2Axis.y + day2Axis.height - 8 }, { alt: true, release: false });
  await expect(ghost.first()).toHaveText("复制 · 09:00–12:00");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "01-alt-copy");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => timeOf(day2Table, "西湖")).toBe("09:00–12:00");
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–12:00");
  await expect((await rowOf(day2Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await expect(page.getByRole("region", { name: "钱的总览" })).toContainText("总额 ¥600");

  // Esc 放弃：预览消失，松手后什么都不变，也不打开详情
  const lakeAgain = center(await box(segment(day1, "西湖")));
  await drag(page, lakeAgain, { x: lakeAgain.x + hour, y: lakeAgain.y }, { release: false });
  await expect(ghost.first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ghost).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "西湖" })).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–12:00");

  // 拖的时候块没了：刚排上时间的灵隐寺，拖到一半按 Ctrl+Z 撤销掉排时间（它加的时候没填时长，撤销后回到「整天」）
  await schedule(page, day1Table, "灵隐寺", "14:00", "2");
  const temple = center(await box(segment(day1, "灵隐寺")));
  await drag(page, temple, { x: temple.x + hour / 2, y: temple.y }, { release: false });
  await expect(ghost.first()).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(day1.getByRole("button", { name: /^灵隐寺 / })).toHaveCount(0);
  await expect(ghost).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toBe("整天");

  expect(errors).toEqual([]);
});
