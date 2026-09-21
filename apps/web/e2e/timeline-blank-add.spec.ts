import { expect, test, type Page } from "@playwright/test";
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
