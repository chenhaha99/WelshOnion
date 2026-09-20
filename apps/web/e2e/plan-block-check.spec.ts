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

test("电脑上：快捷条按一圈换三档、块跟着变样子、大小不变 → 日程里划掉另一件 → 按标记筛 → 总览写待定、划掉各几件", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1);
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖", "灵隐寺", "河坊街"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await schedule(page, day1Table, "灵隐寺", "14:00", "2");
  await schedule(page, day1Table, "河坊街", "19:00", "2");
  await showView(page, "时间线");
  const day1 = timelineRow(page, "10.1");
  const lake = segment(day1, "西湖").getByRole("button", { name: /^西湖 / });

  // 快捷条第一个是标记：点一下换下一档（定了 → 划掉 → 待定 → 定了），横条跟着变样子
  // 位置量的是在这一行里的：第一次划掉，筛选那一行多出「按标记筛选」，页面在最上面时整个往下挪一行
  const before = await boxInRow(lake, day1);
  await lake.click();
  const selected = await looks(lake);
  expect(selected.borderStyle).toBe("solid");
  expect(selected.decoration).toBe("none");
  const toggle = quickBar(page, "西湖").getByRole("button", { name: /^标记：/ });
  await expect(quickBar(page, "西湖").getByRole("button").first()).toHaveAttribute("aria-label", "标记：定了");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "标记：划掉");
  await expect(toggle).toBeFocused();
  await expect(segment(day1, "西湖")).toHaveAttribute("data-mark", "struck");
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
  await shot(page, "01-struck-bar");

  // 再点一下是「待定」：虚线边框，但颜色照常、字不划线；再点一下回「定了」
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "标记：待定");
  await expect(segment(day1, "西湖")).toHaveAttribute("data-mark", "pending");
  await expect(lake).toHaveAttribute("aria-label", "西湖 09:00–12:00 · 待定");
  const pending = await looks(lake);
  expect(pending.borderStyle, "待定也是虚线").toBe("dashed");
  expect(pending.background, "待定不变淡").toBe((await looks(segment(day1, "灵隐寺").getByRole("button", { name: /^灵隐寺 / }))).background);
  expect(pending.decoration, "待定不划线").toBe("none");
  expect(await boxInRow(lake, day1), "大小不变").toEqual(before);
  await shot(page, "01b-pending-bar");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "标记：定了");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-label", "标记：划掉");
  await page.keyboard.press("Escape");

  // 日程里划掉「河坊街」：竖线上的圆圈；白底卡片只改左边一道看不出，整张换成浅灰底、四周一圈虚线，标题划一道；
  // 不是半透明，大小不变
  await showView(page, "日程");
  const street = await rowOf(day1Table, "河坊街");
  const streetCard = street.locator(".schedule-card");
  const cardBefore = await boxInRow(streetCard, street);
  await street.getByRole("button", { name: /^标记：/ }).click();
  await expect(street).toHaveAttribute("data-mark", "struck");
  await expect((await rowOf(day1Table, "西湖")).getByRole("button", { name: /^标记：/ })).toHaveAttribute("aria-label", "标记：划掉");
  expect(await streetCard.evaluate((node) => getComputedStyle(node).borderLeftStyle)).toBe("dashed");
  const struckCard = await looks(streetCard);
  const plainCard = await looks((await rowOf(day1Table, "灵隐寺")).locator(".schedule-card"));
  expect(struckCard.borderStyle, "四周一圈也是虚线").toBe("dashed");
  expect(struckCard.background, "底色和没划掉的不一样").not.toBe(plainCard.background);
  expect(struckCard.opacity).toBe("1");
  expect(await boxInRow(streetCard, street), "大小不变").toEqual(cardBefore);
  // 本来就淡的「填开销」不跟着换色：换了反倒比没划掉的深
  const moneyColor = (row: Locator) => row.getByRole("button", { name: "开销" }).evaluate((node) => getComputedStyle(node).color);
  expect(await moneyColor(street), "「填开销」的颜色").toBe(await moneyColor(await rowOf(day1Table, "灵隐寺")));
  expect(
    await street.getByRole("textbox", { name: "标题" }).evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe("line-through");
  await shot(page, "02-list-struck");

  // 按标记筛：按下「定了」只剩「灵隐寺」；再按「划掉」，划掉的两件也回来
  await showView(page, "时间线");
  const marks = page.getByRole("group", { name: "按标记筛选" });
  await marks.getByRole("button", { name: "定了" }).click();
  await expect(segment(day1, "西湖")).toHaveCount(0);
  await expect(segment(day1, "河坊街")).toHaveCount(0);
  await expect(segment(day1, "灵隐寺")).toHaveCount(1);
  await marks.getByRole("button", { name: "划掉" }).click();
  await expect(segment(day1, "西湖")).toHaveCount(1);
  await marks.getByRole("button", { name: "全部标记" }).click();
  await expect(marks.getByRole("button", { name: "定了" })).toHaveAttribute("aria-pressed", "false");

  // 总览：划掉 2 件，共 3 件
  await showView(page, "总览");
  await expect(page.getByRole("region", { name: "时间总览" }).getByText("划掉 2 件，共 3 件")).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：竖条选中，底部快捷条第一个按钮划掉，竖条变成虚线", async ({ page }) => {
  const errors = watchErrors(page);
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 1, { width: 390, height: 844 });
  const day1Table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1Table, ["西湖"]);
  await schedule(page, day1Table, "西湖", "09:00", "3");
  await showView(page, "时间线");
  const timeline = page.getByRole("region", { name: "时间线" });
  const lake = timeline.getByRole("button", { name: /^西湖 / });

  await lake.click();
  const toggle = quickBar(page, "西湖").getByRole("button", { name: /^标记：/ });
  await expect(toggle).toBeInViewport();
  await toggle.click();
  await expect(timeline.locator("[data-segment]").first()).toHaveAttribute("data-mark", "struck");
  expect((await looks(lake)).borderStyle).toBe("dashed");
  await shot(page, "03-phone-struck");

  expect(errors).toEqual([]);
});

test("按标记筛：只用键盘在日程里挨个划掉 → 焦点落到下一行 → 一行不剩焦点到这天的菜单 → 手机上那一行不撑出屏幕", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  const rows = table.locator("tr[data-block-id]");
  const filteredOut = table.locator("[data-filtered-out]");
  await addBlocks(page, table, ["西湖", "午饭", "灵隐寺"]);
  await pickKind(page, table, "午饭", "餐饮");
  await (await rowOf(table, "午饭")).getByRole("button", { name: /^标记：/ }).click();

  // 有划掉、待定的才有这一组；按下「定了」表里只剩定了的，写「筛掉了 N 件」
  const onlyDecided = page.getByRole("group", { name: "按标记筛选" }).getByRole("button", { name: "定了" });
  await onlyDecided.click();
  await expect(onlyDecided).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(filteredOut).toHaveText("筛掉了 1 件");
  await shot(page, "04-only-unchecked");

  // 只用键盘挨个划掉：空格划掉这一行，它消失，焦点落到下一行的勾选框
  await rows.nth(0).getByRole("button", { name: /^标记：/ }).focus();
  for (const remaining of [1, 0]) {
    await page.keyboard.press("Space");
    await expect(rows).toHaveCount(remaining);
    if (remaining > 0) await expect(rows.nth(0).getByRole("button", { name: /^标记：/ })).toBeFocused();
  }
  await expect(filteredOut).toHaveText("筛掉了 3 件");
  // 一行都不剩：焦点落到这天的菜单按钮（不进输入框，Ctrl+Z 照样能用）
  const day1 = page.getByRole("list", { name: "日期列表" }).getByRole("listitem").nth(0);
  await expect(day1.getByRole("button", { name: "这天的操作" })).toBeFocused();
  await shot(page, "05-all-struck");

  await onlyDecided.click();
  await expect(rows).toHaveCount(3);
  await expect(filteredOut).toHaveCount(0);

  // 手机：筛选那一行放不下就换行，不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await onlyDecided.click();
  await expect(rows).toHaveCount(0);
  const box = (await onlyDecided.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "06-mobile");

  expect(errors).toEqual([]);
});
