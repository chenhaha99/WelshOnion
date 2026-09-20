import { expect, test, type Page } from "@playwright/test";
import { fingerMove, fingerTap, fingerUp, longPress } from "./finger";
import {
  addBlocks,
  axisPoint,
  box,
  DAY1,
  newPlan,
  quickBar,
  schedule,
  segment,
  showView,
  timelineRow,
  timeOf,
  type Point,
} from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

function addCard(page: Page) {
  return page.getByRole("dialog", { name: "加一件事" });
}

test("电脑上：点空白弹框 → 回车建出来、选中 → 选中着点空白只取消 → Esc 不建 → 拖出一段 → 撤销", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const ghost = day1.locator("[data-new-range]");

  // 点 14:10 处的空白：画 14:00–15:00 的虚线框，贴着它弹框，焦点在输入框里
  const at1410 = await axisPoint(day1, 850);
  await page.mouse.click(at1410.x, at1410.y);
  await expect(addCard(page)).toBeVisible();
  await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 14:00–15:00")).toBeVisible();
  await expect(ghost).toHaveText("14:00–15:00");
  await expect(addCard(page).getByRole("textbox", { name: "加一件事" })).toBeFocused();
  // 框贴着虚线框：左边离得不远
  const ghostBox = await box(ghost);
  const cardBox = (await addCard(page).boundingBox())!;
  expect(Math.abs(cardBox.x - ghostBox.x)).toBeLessThan(260);
  await shot(page, "01-click-card");

  // 填标题回车：框关掉，午饭画在 14:00–15:00、选中着
  await page.keyboard.type("午饭");
  await page.keyboard.press("Enter");
  await expect(addCard(page)).toBeHidden();
  await expect(ghost).toHaveCount(0);
  await expect(segment(day1, "午饭")).toHaveAttribute("data-from", "840");
  await expect(segment(day1, "午饭")).toHaveAttribute("data-to", "900");
  await expect(quickBar(page, "午饭")).toBeVisible();
  await shot(page, "02-added-selected");

  // 选中着时点空白：只取消选中，不弹框；再点一次才弹，Esc 关掉什么都不建
  const at1710 = await axisPoint(day1, 1030);
  await page.mouse.click(at1710.x, at1710.y);
  await expect(quickBar(page, "午饭")).toBeHidden();
  await expect(addCard(page)).toHaveCount(0);
  await page.mouse.click(at1710.x, at1710.y);
  await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 17:00–18:00")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(addCard(page)).toHaveCount(0);
  await expect(ghost).toHaveCount(0);
  await expect(day1.locator("[data-segment]")).toHaveCount(2);

  // 按住 17:20 处的空白往左拖到 15:05：虚线框和指针上方都写 15:00–17:30，松手弹框
  const from = await axisPoint(day1, 1040);
  const to = await axisPoint(day1, 905);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await expect(ghost).toHaveText("15:00–17:30");
  await expect(page.locator("[data-drag-label]")).toHaveText("15:00–17:30");
  await shot(page, "03-drag-range", { dragging: true });
  await page.mouse.up();
  await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 15:00–17:30")).toBeVisible();
  await page.keyboard.type("宋城");
  await page.keyboard.press("Enter");
  await expect.poll(() => timeOf(day1Table, "宋城")).toBe("15:00–17:30");

  // 一次建是一步撤销
  await page.keyboard.press("Control+z");
  await expect(day1Table.getByRole("button", { name: /宋城/ })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test.describe("手机上", () => {
  test.use({ hasTouch: true });

  test("轻点空白不弹 → 按住 0.5 秒画 1 小时、抬起弹框建出来 → 按住拖出一段、Esc 不建", async ({ page }) => {
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date("2026-09-20T02:00:00Z"));
    await newPlan(page, 1, { width: 390, height: 844 });
    const day1Table = page.getByRole("table", { name: DAY1 });
    await addBlocks(page, day1Table, ["西湖"]);
    await schedule(page, day1Table, "西湖", "09:00", "3");
    await showView(page, "时间线");
    const timeline = page.getByRole("region", { name: "时间线" });
    const axis = timeline.locator("[data-day-axis]");
    const ghost = axis.locator("[data-new-range]");

    /** 竖轴上某个钟点、靠右一点的位置（框打开时滚到了 09:00，下午这几个钟点都在框里）。 */
    const spot = async (minute: number): Promise<Point> => {
      const rect = await box(axis);
      return { x: rect.x + rect.width * 0.7, y: rect.y + (minute / 1440) * rect.height };
    };

    // 轻点：不弹
    await fingerTap(page, await spot(850));
    await page.waitForTimeout(700);
    await expect(addCard(page)).toHaveCount(0);
    await expect(ghost).toHaveCount(0);

    // 按住 0.5 秒：画 14:00–15:00；抬起弹框，填标题回车建出来
    await longPress(page, await spot(850));
    await expect(ghost).toHaveText("14:00–15:00");
    await expect(page.locator("[data-drag-label]")).toHaveText("14:00–15:00");
    await shot(page, "04-phone-long-press", { dragging: true });
    await fingerUp(page);
    await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 14:00–15:00")).toBeVisible();
    await page.keyboard.type("午饭");
    await page.keyboard.press("Enter");
    await expect(addCard(page)).toHaveCount(0);
    await expect(segment(timeline, "午饭")).toHaveAttribute("data-from", "840");

    // 按住 16:10 处 0.5 秒，往下拖到 17:40：画 16:00–17:45；抬起弹框，Esc 关掉不建。
    // 先把框滚到下午：离午饭远一点（手指按在块旁边几像素，浏览器会把它算成按在块上），也离框的上下边远（到框边框会自己滚）
    await timeline.locator("[data-day-scroll]").evaluate((element) => {
      element.scrollTop = 600;
    });
    const start = await spot(970);
    const end = await spot(1060);
    await longPress(page, start);
    await fingerMove(page, start, end);
    await expect(ghost).toHaveText("16:00–17:45");
    await fingerUp(page);
    await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 16:00–17:45")).toBeVisible();
    await shot(page, "05-phone-card");
    await page.keyboard.press("Escape");
    await expect(addCard(page)).toHaveCount(0);
    await expect(timeline.locator("[data-segment]")).toHaveCount(2);

    expect(errors).toEqual([]);
  });

  test("按住拖过 24 点：跨天建一件（你提的：拖到 24 点就停住了，不能往下继续）", async ({ page }) => {
    const errors = watchErrors(page);
    await page.clock.setFixedTime(new Date("2026-09-20T02:00:00Z"));
    await newPlan(page, 2, { width: 390, height: 844 });
    const day1Table = page.getByRole("table", { name: DAY1 });
    await addBlocks(page, day1Table, ["西湖"]);
    await schedule(page, day1Table, "西湖", "09:00", "3");
    await showView(page, "时间线");
    const timeline = page.getByRole("region", { name: "时间线" });
    const axis = timeline.locator("[data-day-axis]");
    const ghost = axis.locator("[data-new-range]");

    // 框滚到最下面，按住 23:00 往屏幕底下拖：这一天只画到 24:00，时间写整段
    await timeline.locator("[data-day-scroll]").evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    const rect = await box(axis);
    const late = { x: rect.x + rect.width * 0.7, y: rect.y + (1380 / 1440) * rect.height };
    await longPress(page, late);
    await fingerMove(page, late, { x: late.x, y: 840 });
    await expect(ghost).toHaveText(/^23:00–10\.2 /);
    await shot(page, "06-phone-across-days", { dragging: true });
    await fingerUp(page);
    await expect(addCard(page).getByText(/^第 1 天 · 10\.1 周四 · 23:00–10\.2 /)).toBeVisible();
    await page.keyboard.type("夜宵");
    await page.keyboard.press("Enter");
    await expect.poll(() => timeOf(day1Table, "夜宵")).toMatch(/^23:00–10\.2 /);

    expect(errors).toEqual([]);
  });
});

test("电脑上：按住拖到下一行，跨天建一件（你提的：拖到 24 点就停住了）", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  // 没事的凌晨和深夜默认折起，22:10 在折起的那一截里：先展开成 0–24 点
  await page.getByRole("button", { name: "0–24 点" }).click();
  const day1 = timelineRow(page, "10.1");
  const day2 = timelineRow(page, "10.2");

  // 按住 10.1 的 22:10，一直拖到 10.2 的 01:50：两行都画出虚线框，时间写在开始那一行上
  const from = await axisPoint(day1, 1330);
  const to = await axisPoint(day2, 110);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await expect(day1.locator("[data-new-range]")).toHaveText("22:00–10.2 02:00");
  await expect(day2.locator("[data-new-range]")).toHaveCount(1);
  await shot(page, "07-drag-across-days", { dragging: true });
  await page.mouse.up();

  // 松手弹框、建出来：10.1 画到 24:00，10.2 从 00:00 接着画；日程里写「22:00–10.2 02:00」
  await expect(addCard(page).getByText("第 1 天 · 10.1 周四 · 22:00–10.2 02:00")).toBeVisible();
  await page.keyboard.type("夜宵");
  await page.keyboard.press("Enter");
  await expect(segment(day1, "夜宵")).toHaveAttribute("data-from", "1320");
  await expect(segment(day1, "夜宵")).toHaveAttribute("data-to", "1440");
  await expect(segment(day2, "夜宵")).toHaveAttribute("data-from", "0");
  await expect(segment(day2, "夜宵")).toHaveAttribute("data-to", "120");
  await expect.poll(() => timeOf(day1Table, "夜宵")).toBe("22:00–10.2 02:00");

  expect(errors).toEqual([]);
});
