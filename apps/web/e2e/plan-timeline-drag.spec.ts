import { expect, test } from "@playwright/test";
import {
  addBlocks,
  box,
  center,
  DAY1,
  DAY2,
  DAY3,
  drag,
  hourWidth,
  inOverview,
  newPlan,
  pickKind,
  quickBar,
  rowOf,
  schedule,
  segment,
  timelineRow,
  timeOf,
  tray,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

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
  const label = page.locator("[data-drag-label]");
  // 加一件再撤销：「重做」亮着。拖动中它一直亮着，就说明松手前没往计划里写（一写重做就没了）
  await addBlocks(page, day2Table, ["临时"]);
  await page.getByRole("button", { name: "撤销" }).click();
  const redo = page.getByRole("button", { name: "重做" });
  await expect(redo).toBeEnabled();

  // 点一下：选中它，旁边出快捷条；没开详情面板
  const lake = center(await box(segment(day1, "西湖")));
  await page.mouse.click(lake.x, lake.y);
  await expect(quickBar(page, "西湖")).toBeVisible();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(quickBar(page, "西湖")).toBeHidden();

  // 往右拖 1 小时、先不松手：西湖已经画在 10:00–13:00、是拿起来的样子，指针上方写着时间；计划还没变
  await drag(page, lake, { x: lake.x + hour, y: lake.y }, { release: false });
  await expect(label).toHaveText("10:00–13:00");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-lifted", "true");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "600");
  await expect(redo).toBeEnabled();
  await shot(page, "01-dragging", { dragging: true });
  await page.mouse.up();
  await expect(redo).toBeDisabled();
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("10:00–13:00");
  await expect(label).toHaveCount(0);
  await expect(page.locator("[data-lifted]")).toHaveCount(0);
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

  // 拖到下一天的凌晨：按住夜宵中间（22:30），拖到 10.2 那一行的 01:30，落在 10.2 01:00
  // 指针拖出横轴右边就进了右边的「没排时间」栏，所以跨午夜是往下一行拖
  const supper = center(await box(segment(day1, "夜宵")));
  const day2AxisNow = await box(day2.locator("[data-timeline-axis]"));
  await drag(page, supper, { x: day2AxisNow.x + (90 / 1440) * day2AxisNow.width, y: day2AxisNow.y + day2AxisNow.height - 8 });
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

test("叠上去还是放旁边，松手前就画成松手后的样子：中间叠上去 → 下边放旁边 → 空白处放旁边 → 类型层不同的不算 → 带着里面的块走", async ({
  page,
}) => {
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
  /** 明清宫苑画在第几道、缩几级 */
  const expectPalace = async (lane: string, depth: string) => {
    await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-lane", lane);
    await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-depth", depth);
  };
  /** 按住明清宫苑的中间，横向不动拖到横店横条从上往下 share 处，不松手 */
  const dragPalaceOntoHengdian = async (share: number) => {
    const palace = center(await box(segment(day1, "明清宫苑")));
    const hengdian = await box(segment(day1, "横店"));
    await drag(page, palace, { x: palace.x, y: hengdian.y + hengdian.height * share }, { release: false });
  };

  // 叠上去：拖到横店横条的正中间，还没松手就画在第 1 道、缩 1 级，横店描边；松手后一样
  await dragPalaceOntoHengdian(0.5);
  await expect(segment(day1, "横店")).toHaveAttribute("data-drop-target", "true");
  await expectPalace("1", "1");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "01-drop-onto", { dragging: true });
  await page.mouse.up();
  await expectPalace("1", "1");

  // 放旁边：拖到横店横条的下边上（从上往下 85%），还没松手就画在第 2 道、不缩，没有块描边；松手后一样
  await dragPalaceOntoHengdian(0.85);
  await expect(day1.locator('[data-drop-target="true"]')).toHaveCount(0);
  await expectPalace("2", "0");
  await shot(page, "02-drop-beside-edge", { dragging: true });
  await page.mouse.up();
  await expectPalace("2", "0");

  // 空白处：先叠回横店，再拖到第 2 道 10:00–12:00 那段空白（午饭那一道），还没松手就画在第 2 道、不缩；松手后一样
  await dragPalaceOntoHengdian(0.5);
  await page.mouse.up();
  await expectPalace("1", "1");
  const nested = center(await box(segment(day1, "明清宫苑")));
  const lunch = await box(segment(day1, "午饭"));
  await drag(page, nested, { x: nested.x, y: lunch.y + lunch.height / 2 }, { release: false });
  await expect(day1.locator('[data-drop-target="true"]')).toHaveCount(0);
  await expectPalace("2", "0");
  await page.mouse.up();
  await expectPalace("2", "0");

  // 类型层不同的不算叠上去：午饭拖到在杭州（停留）背景条的正中间，不描边、不缩
  const lunchNow = center(await box(segment(day1, "午饭")));
  const stay = await box(segment(day1, "在杭州"));
  await drag(page, lunchNow, { x: lunchNow.x, y: stay.y + stay.height / 2 }, { release: false });
  await expect(segment(day1, "在杭州")).not.toHaveAttribute("data-drop-target", "true");
  await expect(segment(day1, "午饭")).toHaveAttribute("data-depth", "0");
  await page.mouse.up();
  await expect(segment(day1, "午饭")).toHaveAttribute("data-depth", "0");
  expect(await timeOf(day1Table, "午饭")).toBe("12:00–13:00");

  // 带着里面的块走：先把明清宫苑叠回横店，再按住横店 17:00 那里往右拖 1 小时，还没松手就画在松手后的位置、明清宫苑描出来
  await dragPalaceOntoHengdian(0.5);
  await page.mouse.up();
  await expectPalace("1", "1");
  const hd = await box(segment(day1, "横店"));
  const grab = { x: hd.x + hd.width * 0.75, y: hd.y + hd.height / 2 };
  await drag(page, grab, { x: grab.x + hour / 2, y: grab.y }, { release: false });
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-follower", "true");
  await page.mouse.move(grab.x + hour, grab.y, { steps: 4 });
  await expect(segment(day1, "横店")).toHaveAttribute("data-from", "540");
  await expect(segment(day1, "明清宫苑")).toHaveAttribute("data-from", "660");
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
  await (await rowOf(day1Table, "西湖")).getByRole("button", { name: "开销" }).click();
  await page.getByRole("group", { name: "西湖 的开销" }).getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect((await rowOf(day1Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const hour = await hourWidth(day1);
  const label = page.locator("[data-drag-label]");

  // 按住 Alt 拖到 10.2：指针上方写「复制 · 」，10.1 的西湖还在原处，10.2 画着复制出来的；松手后原来的不动，10.2 多一个，开销也复制成新的一笔
  const lake = center(await box(segment(day1, "西湖")));
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  await drag(page, lake, { x: lake.x, y: day2Axis.y + day2Axis.height - 8 }, { alt: true, release: false });
  await expect(label).toHaveText("复制 · 09:00–12:00");
  await expect(segment(day1, "西湖")).not.toHaveAttribute("data-lifted", "true");
  await expect(segment(day2, "西湖")).toHaveAttribute("data-lifted", "true");
  await page.getByRole("region", { name: "时间轴" }).scrollIntoViewIfNeeded();
  await shot(page, "01-alt-copy", { dragging: true });
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => timeOf(day2Table, "西湖")).toBe("09:00–12:00");
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–12:00");
  await expect((await rowOf(day2Table, "西湖")).locator("[data-money-cell]")).toHaveText("¥300");
  await inOverview(page, ({ money }) => expect(money).toContainText("总额 ¥600"));

  // Esc 放弃：画回拖之前的样子，松手后什么都不变，也不打开详情
  const lakeAgain = center(await box(segment(day1, "西湖")));
  await drag(page, lakeAgain, { x: lakeAgain.x + hour, y: lakeAgain.y }, { release: false });
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "600");
  await page.keyboard.press("Escape");
  await expect(label).toHaveCount(0);
  await expect(segment(day1, "西湖")).toHaveAttribute("data-from", "540");
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "西湖" })).toHaveCount(0);
  expect(await timeOf(day1Table, "西湖")).toBe("09:00–12:00");

  // 拖的时候块没了：刚排上时间的灵隐寺，拖到一半按 Ctrl+Z 撤销掉排时间
  // 它加的时候没填时长，撤销后回到「整天」：横轴上没了，出现在右边的「没排时间」栏里
  await schedule(page, day1Table, "灵隐寺", "14:00", "2");
  const temple = center(await box(segment(day1, "灵隐寺")));
  await drag(page, temple, { x: temple.x + hour / 2, y: temple.y }, { release: false });
  await expect(label).toBeVisible();
  await page.keyboard.press("Control+z");
  await expect(day1.locator("[data-timeline-axis]").getByRole("button", { name: /^灵隐寺 / })).toHaveCount(0);
  await expect(tray(page).getByRole("button", { name: "灵隐寺 10.1 整天" })).toBeVisible();
  await expect(label).toHaveCount(0);
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toBe("整天");

  expect(errors).toEqual([]);
});

test("行不变矮 → 只有一道时拖到横条上边也能并排", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["横店", "游船"]);
  await schedule(page, day1Table, "横店", "08:00", "12");
  await schedule(page, day1Table, "游船", "10:00", "2");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  // box 先切到时间轴视图再量
  const axisHeight = async () => (await box(day1.locator("[data-timeline-axis]"))).height;
  const twoLanes = await axisHeight();
  await expect(segment(day1, "游船")).toHaveAttribute("data-lane", "2");

  // 把游船拖到 10.2、横向不动，还没松手：10.1 还是两道高，第 2 道空着；松手后收成一道
  const boat = center(await box(segment(day1, "游船")));
  const day2Axis = await box(day2.locator("[data-timeline-axis]"));
  await drag(page, boat, { x: boat.x, y: day2Axis.y + day2Axis.height / 2 }, { release: false });
  await expect(segment(day2, "游船")).toHaveAttribute("data-lifted", "true");
  expect(await axisHeight()).toBe(twoLanes);
  await shot(page, "01-row-keeps-height", { dragging: true });
  await page.mouse.up();
  await expect.poll(axisHeight).toBeLessThan(twoLanes);

  // 10.1 只剩横店一道：把游船拖回横店横条的上边上（从上往下 15%），还没松手就多出第 2 道、游船画在那里不缩，横店不描边；松手后一样
  const boatAgain = center(await box(segment(day2, "游船")));
  const hengdian = await box(segment(day1, "横店"));
  await drag(page, boatAgain, { x: boatAgain.x, y: hengdian.y + hengdian.height * 0.15 }, { release: false });
  await expect(segment(day1, "横店")).not.toHaveAttribute("data-drop-target", "true");
  await expect(segment(day1, "游船")).toHaveAttribute("data-lane", "2");
  await expect(segment(day1, "游船")).toHaveAttribute("data-depth", "0");
  await shot(page, "02-beside-single-lane", { dragging: true });
  await page.mouse.up();
  await expect(segment(day1, "游船")).toHaveAttribute("data-lane", "2");
  await expect(segment(day1, "游船")).toHaveAttribute("data-depth", "0");
  expect(await timeOf(day1Table, "游船")).toBe("10:00–12:00");

  expect(errors).toEqual([]);
});
