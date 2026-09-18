import { expect, test, type Locator } from "@playwright/test";
import { addBlocks, DAY1, newPlan, pickKind, quickBar, rowOf, schedule, segment, showView, timelineRow } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 「现在」固定在 9.14，行程 10.1 还没出发：手机竖排打开是第一天
const BEFORE_TRIP = new Date("2026-09-14T06:20:00Z");

/** 画出来的样子：边框虚实、边框色、底色、字色、有没有划线、整块透明度、选中的描边色。 */
async function looks(element: Locator) {
  return element.evaluate((node) => {
    const style = getComputedStyle(node);
    return {
      borderStyle: style.borderTopStyle,
      borderColor: style.borderTopColor,
      background: style.backgroundColor,
      color: style.color,
      decoration: style.textDecorationLine,
      opacity: style.opacity,
      outlineColor: style.outlineColor,
    };
  });
}

/** 块在它那一行里的位置和大小（取整的像素）：左、上、宽、高。 */
async function boxInRow(element: Locator, row: Locator): Promise<number[]> {
  const box = (await element.boundingBox())!;
  const rowBox = (await row.boundingBox())!;
  return [box.x - rowBox.x, box.y - rowBox.y, box.width, box.height].map(Math.round);
}

test("电脑上：快捷条划掉一件、块变成虚线变淡划线、大小不变 → 列表里划掉另一件 → 只看没划掉的 → 总览写划掉了几件", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "灵隐寺", "河坊街"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "灵隐寺", "14:00", "2");
  await schedule(page, day1Table, "河坊街", "19:00", "2");
  await showView(page, "时间轴");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖").getByRole("button", { name: /^西湖 / });

  // 快捷条第一个是「划掉」：点了按下，横条变成虚线、底色和字变淡、字上划一道；大小不变，选中的描边不跟着变淡
  // 位置量的是在这一行里的：第一次划掉，筛选那一行多出「只看没划掉的」，页面在最上面时整个往下挪一行
  const before = await boxInRow(lake, day1);
  await lake.click();
  const selected = await looks(lake);
  expect(selected.borderStyle).toBe("solid");
  expect(selected.decoration).toBe("none");
  const toggle = quickBar(page, "西湖").getByRole("button", { name: "划掉", exact: true });
  await expect(quickBar(page, "西湖").getByRole("button").first()).toHaveAttribute("aria-label", "划掉");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(toggle).toBeFocused();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-checked", "true");
  await expect(lake).toHaveAttribute("aria-label", "西湖 09:00–12:00 · 划掉了");
  const struck = await looks(lake);
  expect(struck.borderStyle).toBe("dashed");
  expect(struck.decoration).toBe("line-through");
  expect(struck.borderColor).not.toBe(selected.borderColor);
  expect(struck.background).not.toBe(selected.background);
  expect(struck.color).not.toBe(selected.color);
  expect(struck.opacity).toBe("1");
  expect(struck.outlineColor).toBe(selected.outlineColor);
  expect(await boxInRow(lake, day1)).toEqual(before);
  await expect(lake.locator("[data-checked-mark]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await shot(page, "01-struck-bar");

  // 列表里划掉「河坊街」：标题前面的勾选框；这一行左边一道变虚线，标题划一道
  await showView(page, "列表");
  const street = await rowOf(day1Table, "河坊街");
  await street.getByRole("checkbox", { name: "划掉" }).check();
  await expect(street).toHaveAttribute("data-checked", "true");
  await expect((await rowOf(day1Table, "西湖")).getByRole("checkbox", { name: "划掉" })).toBeChecked();
  expect(await street.locator("td").first().evaluate((node) => getComputedStyle(node).borderLeftStyle)).toBe("dashed");
  expect(
    await street.getByRole("textbox", { name: "标题" }).evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe("line-through");
  await shot(page, "02-list-struck");

  // 只看没划掉的：时间轴上只剩「灵隐寺」
  await showView(page, "时间轴");
  await page.getByRole("button", { name: "只看没划掉的" }).click();
  await expect(segment(day1, "西湖")).toHaveCount(0);
  await expect(segment(day1, "河坊街")).toHaveCount(0);
  await expect(segment(day1, "灵隐寺")).toHaveCount(1);
  await page.getByRole("button", { name: "只看没划掉的" }).click();

  // 总览：划掉 2 件，共 3 件
  await showView(page, "总览");
  await expect(page.getByRole("region", { name: "占比" }).getByText("划掉 2 件，共 3 件")).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：竖条选中，底部快捷条的「划掉」，竖条变成虚线", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间轴");
  const timeline = page.getByRole("region", { name: "时间轴" });
  const lake = timeline.getByRole("button", { name: /^西湖 / });

  await lake.click();
  const toggle = quickBar(page, "西湖").getByRole("button", { name: "划掉", exact: true });
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(timeline.locator("[data-segment]").first()).toHaveAttribute("data-checked", "true");
  expect((await looks(lake)).borderStyle).toBe("dashed");
  await shot(page, "03-phone-struck");

  expect(errors).toEqual([]);
});

test("只看没划掉的：只用键盘在列表里挨个划掉 → 焦点落到下一行 → 一行不剩焦点到这天的菜单 → 手机上那一行不撑出屏幕", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  const rows = table.locator("tr[data-block-id]");
  const filteredOut = table.locator("[data-filtered-out]");
  await addBlocks(page, table, ["西湖", "午饭", "灵隐寺"]);
  await pickKind(page, table, "午饭", "餐饮");
  await (await rowOf(table, "午饭")).getByRole("checkbox", { name: "划掉" }).check();

  // 有划掉的才有这个按钮；按下后表里只剩没划掉的，写「筛掉了 N 件」
  const onlyUnchecked = page.getByRole("button", { name: "只看没划掉的" });
  await onlyUnchecked.click();
  await expect(onlyUnchecked).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(filteredOut).toHaveText("筛掉了 1 件");
  await shot(page, "04-only-unchecked");

  // 只用键盘挨个划掉：空格划掉这一行，它消失，焦点落到下一行的勾选框
  await rows.nth(0).getByRole("checkbox", { name: "划掉" }).focus();
  for (const remaining of [1, 0]) {
    await page.keyboard.press("Space");
    await expect(rows).toHaveCount(remaining);
    if (remaining > 0) await expect(rows.nth(0).getByRole("checkbox", { name: "划掉" })).toBeFocused();
  }
  await expect(filteredOut).toHaveText("筛掉了 3 件");
  // 一行都不剩：焦点落到这天的菜单按钮（不进输入框，Ctrl+Z 照样能用）
  const day1 = page.getByRole("list", { name: "日期列表" }).getByRole("listitem").nth(0);
  await expect(day1.getByRole("button", { name: "这天的操作" })).toBeFocused();
  await shot(page, "05-all-struck");

  await onlyUnchecked.click();
  await expect(rows).toHaveCount(3);
  await expect(filteredOut).toHaveCount(0);

  // 手机：筛选那一行放不下就换行，不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await onlyUnchecked.click();
  await expect(rows).toHaveCount(0);
  const box = (await onlyUnchecked.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "06-mobile");

  expect(errors).toEqual([]);
});
