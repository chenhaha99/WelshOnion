import { expect, test } from "@playwright/test";
import {
  addBlocks,
  axisPoint,
  box,
  center,
  chip,
  countRows,
  DAY1,
  DAY2,
  DAY3,
  drag,
  keepUndated,
  newPlan,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
  tray,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 规格里几个场景各放一天，免得互相挡住：落点在别的块上会变成叠上去

test("从栏里拖到时间线上：没填时长给 1 小时 → 撤销 → 用填过的时长、按着 Alt 也不复制 → Esc → 叠到横条上", async ({
  page,
}) => {
  const errors = watchErrors(page);
  await newPlan(page, 3);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day2Table = page.getByRole("table", { name: DAY2 });
  const day3Table = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, day1Table, ["灵隐寺", "河坊街"]);
  await keepUndated(page, day1Table, "灵隐寺", "上午", "2");
  await addBlocks(page, day3Table, ["横店", "明清宫苑"]);
  await schedule(page, day3Table, "横店", "08:00", "12");
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");
  const day3 = timelineRow(page, "10.3");
  const label = page.locator("[data-drag-label]");
  await showView(page, "时间线");
  // 条上是整个计划没排时间的事：10.1 的两件，加上 10.3 还没排的明清宫苑
  await expect(tray(page).getByRole("button")).toHaveText([/河坊街/, /灵隐寺/, /明清宫苑/]);

  // 没填时长的河坊街拖到 10.2 的 19:00：还没松手就画在 10.2 那一行 19:00–20:00，栏里的它变淡
  await drag(page, center(await box(chip(page, "河坊街"))), await axisPoint(day2, 19 * 60), { release: false });
  await expect(label).toHaveText("19:00–20:00");
  await expect(segment(day2, "河坊街")).toHaveAttribute("data-from", "1140");
  await expect(chip(page, "河坊街")).toHaveAttribute("data-dragging", "true");
  await shot(page, "01-from-tray", { dragging: true });
  await page.mouse.up();
  await expect.poll(() => timeOf(day2Table, "河坊街")).toBe("19:00–20:00");
  await expect(chip(page, "河坊街")).toHaveCount(0);

  // 一次拖拽一步撤销：回到 10.1 的栏、整天
  await page.keyboard.press("Control+z");
  await expect.poll(() => timeOf(day1Table, "河坊街")).toBe("整天");
  await expect(chip(page, "河坊街")).toHaveCount(1);

  // 填了 2 小时的灵隐寺按着 Alt 拖到 10.1 的 14:00：用填过的时长，也不复制
  await drag(page, center(await box(chip(page, "灵隐寺"))), await axisPoint(day1, 14 * 60), { alt: true, release: false });
  await expect(label).toHaveText("14:00–16:00");
  await page.mouse.up();
  await page.keyboard.up("Alt");
  await expect.poll(() => timeOf(day1Table, "灵隐寺")).toBe("14:00–16:00");
  await expect(chip(page, "灵隐寺")).toHaveCount(0);
  expect(await countRows(day1Table, "灵隐寺")).toBe(1);

  // Esc 放弃：河坊街还在栏里，不打开详情
  await drag(page, center(await box(chip(page, "河坊街"))), await axisPoint(day1, 18 * 60), { release: false });
  await expect(day1.locator("[data-timeline-axis]").getByRole("button", { name: /^河坊街 / })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(label).toHaveCount(0);
  await expect(day1.locator("[data-timeline-axis]").getByRole("button", { name: /^河坊街 / })).toHaveCount(0);
  await page.mouse.up();
  await expect(page.getByRole("dialog", { name: "河坊街" })).toHaveCount(0);
  await expect(chip(page, "河坊街")).toHaveCount(1);

  // 叠到横条上：明清宫苑拖到横店的 10:00，拖的时候横店描边，松手后 10:00–11:00、缩 1 级
  const hengdian = await box(segment(day3, "横店"));
  const onto = { x: (await axisPoint(day3, 10 * 60)).x, y: hengdian.y + hengdian.height / 2 };
  await drag(page, center(await box(chip(page, "明清宫苑"))), onto, { release: false });
  await expect(segment(day3, "横店")).toHaveAttribute("data-drop-target", "true");
  await expect(segment(day3, "明清宫苑")).toHaveAttribute("data-lane", "1");
  await expect(segment(day3, "明清宫苑")).toHaveAttribute("data-depth", "1");
  await page.mouse.up();
  await expect.poll(() => timeOf(day3Table, "明清宫苑")).toBe("10:00–11:00");
  await expect(segment(day3, "明清宫苑")).toHaveAttribute("data-depth", "1");

  expect(errors).toEqual([]);
});

test("拖进条里变回没排时间：按开始时刻进格子 → 留在原来那一天 → 凌晨归整天 → 套在上面的块不动", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3);
  const day1Table = page.getByRole("table", { name: DAY1 });
  const day3Table = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, day1Table, ["西湖", "夜宵", "早班车"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "夜宵", "22:00", "1");
  await schedule(page, day1Table, "早班车", "05:00", "1");
  await addBlocks(page, day3Table, ["横店", "明清宫苑"]);
  await schedule(page, day3Table, "横店", "08:00", "12");
  await schedule(page, day3Table, "明清宫苑", "10:00", "2");
  const day1 = timelineRow(page, "10.1");
  const day3 = timelineRow(page, "10.3");

  // 西湖 09:00 拖进条里：拖的时候条描边、写「上午」；松手后在条上，上午 · 3 小时
  // 条上一件都没有时它不占位（你提的），按住往外拖才浮出来：先拖一点点，再量它在哪
  const lake = center(await box(segment(day1, "西湖")));
  await drag(page, lake, { x: lake.x + 30, y: lake.y }, { release: false });
  const trayPoint = center(await box(tray(page)));
  await page.mouse.move(trayPoint.x, trayPoint.y, { steps: 8 });
  await expect(tray(page)).toHaveAttribute("data-drop-target", "true");
  await expect(tray(page).locator("[data-drag-ghost]")).toHaveText("上午");
  await shot(page, "01-into-tray", { dragging: true });
  await page.mouse.up();
  await expect.poll(() => timeOf(day1Table, "西湖")).toBe("上午 · 3 小时");
  await expect(chip(page, "西湖")).toHaveCount(1);
  await expect(tray(page)).not.toHaveAttribute("data-drop-target", "true");

  // 夜宵 22:00 拖进条里：晚上 · 1 小时，还归 10.1（条是整个计划一条，不换天）
  await drag(page, center(await box(segment(day1, "夜宵"))), center(await box(tray(page))));
  await expect.poll(() => timeOf(day1Table, "夜宵")).toBe("晚上 · 1 小时");

  // 早班车 05:00 拖进条里：凌晨开始的归整天
  await drag(page, center(await box(segment(day1, "早班车"))), center(await box(tray(page))));
  await expect.poll(() => timeOf(day1Table, "早班车")).toBe("整天 · 1 小时");

  // 套在上面的块不动：先把明清宫苑叠到横店上，再把横店（按住 17:00 那里）拖进条里
  const palace = center(await box(segment(day3, "明清宫苑")));
  const hengdian = await box(segment(day3, "横店"));
  await drag(page, palace, { x: palace.x, y: hengdian.y + hengdian.height / 2 });
  await expect(segment(day3, "明清宫苑")).toHaveAttribute("data-depth", "1");
  const hd = await box(segment(day3, "横店"));
  await drag(page, { x: hd.x + hd.width * 0.75, y: hd.y + hd.height / 2 }, center(await box(tray(page))));
  // 横店 08:00 开始，进上午
  await expect.poll(() => timeOf(day3Table, "横店")).toBe("上午 · 12 小时");
  expect(await timeOf(day3Table, "明清宫苑")).toBe("10:00–12:00");

  expect(errors).toEqual([]);
});

test("条里的一件：拖到时间线上晃一下再拖回条里 → 什么都不变", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["灵隐寺"]);
  await keepUndated(page, day1Table, "灵隐寺", "上午", "2");
  const day1 = timelineRow(page, "10.1");

  // 拖到时间线上晃一下，再拖回条里：条不描边，松手后什么都不变
  const start = center(await box(chip(page, "灵隐寺")));
  await drag(page, start, await axisPoint(day1, 10 * 60), { release: false });
  await page.mouse.move(start.x, start.y, { steps: 8 });
  await expect(tray(page)).not.toHaveAttribute("data-drop-target", "true");
  await page.mouse.up();
  expect(await timeOf(day1Table, "灵隐寺")).toBe("上午 · 2 小时");
  await expect(chip(page, "灵隐寺")).toHaveCount(1);
  await page.getByRole("region", { name: "时间线" }).scrollIntoViewIfNeeded();
  await shot(page, "01-back-to-tray");

  expect(errors).toEqual([]);
});
