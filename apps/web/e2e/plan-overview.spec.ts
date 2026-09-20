import { expect, test, type Page } from "@playwright/test";
import { DAY1, DAY2, addBlocks, addMoney, keepUndated, newPlan, pickKind, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 10.1 西湖（游玩 ¥300）和午饭（餐饮，叠了半小时）、灵隐寺没排时间 2 小时；10.2 乌镇（游玩 ¥450）。 */
async function trip(page: Page, width: number, height: number): Promise<void> {
  await newPlan(page, 3, { width, height });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖", "午饭", "灵隐寺"]);
  await pickKind(page, day1, "午饭", "餐饮");
  await schedule(page, day1, "西湖", "09:00", "3");
  await schedule(page, day1, "午饭", "11:30", "1");
  await keepUndated(page, day1, "灵隐寺", undefined, "2");
  await addMoney(page, day1, "西湖", "300");
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day2, ["乌镇"]);
  await schedule(page, day2, "乌镇", "09:00", "8");
  await addMoney(page, day2, "乌镇", "450");
}

test("电脑上：总览两个环 → 鼠标放上去 → 点一类看是哪几件 → 只看这一类 → 点一条跳过去", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 1280, 800);
  await showView(page, "总览");

  const moneyCard = page.getByRole("region", { name: "开销总览" });
  const timeCard = page.getByRole("region", { name: "时间总览" });
  // 说明那一列：点开一类后下面那块里也有一列，按名字分开
  const timeLegend = timeCard.getByRole("list", { name: "时间按类型" });
  // 宽屏上两张卡片左右摆
  const [moneyBox, timeBox] = await Promise.all([moneyCard.boundingBox(), timeCard.boundingBox()]);
  expect(moneyBox!.x).toBeLessThan(timeBox!.x);
  expect(Math.abs(moneyBox!.y - timeBox!.y)).toBeLessThan(4);

  // 环中间：开销是总额和人均，时间是排了多久和还有多少没排
  await expect(moneyCard.locator("[data-donut-total]")).toHaveText("¥750");
  await expect(moneyCard.locator("[data-donut-note]")).toHaveText("人均 ¥750");
  await expect(moneyCard.getByRole("list", { name: "开销按类型" }).getByRole("listitem")).toHaveText(["游玩 ¥750 · 100%"]);
  // 西湖 3 小时和午饭 1 小时叠了半小时，两件层一样高、各算各的；加上乌镇 8 小时
  await expect(timeCard.locator("[data-donut-total]")).toHaveText("12 小时");
  await expect(timeCard.locator("[data-donut-note]")).toHaveText("还有 2 小时没排");
  await expect(timeLegend.getByRole("listitem")).toHaveText(["游玩 11 小时 · 92%", "餐饮 1 小时 · 8%"]);
  await shot(page, "01-overview");

  // 鼠标放在环的一段上：跟出来一小块，写这一类几件事
  // 环的正中间是空的（那里是合计那几个字），所以按坐标停在圈上：从 12 点往右一点，正是第一段「游玩」
  await timeCard.locator("[data-donut]").hover({ position: { x: 88, y: 8 } });
  const tip = page.locator("[data-donut-tip]");
  await expect(tip).toHaveText("游玩 11 小时 · 92%2 件事");
  await shot(page, "02-hover", { screen: true });

  // 点说明里的一类：下面列出是哪几件事，按时间先后
  await timeCard.getByRole("button", { name: /^游玩 / }).click();
  const opened = page.getByRole("region", { name: "游玩的事" });
  await expect(opened.getByRole("listitem")).toHaveText(["西湖 10.1 09:00 · 3 小时", "乌镇 10.2 09:00 · 8 小时"]);
  await shot(page, "03-opened");

  // 只看这一类：筛选那一排按下「游玩」，餐饮从环上没了
  await opened.getByRole("button", { name: "只看这一类" }).click();
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  await expect(kinds.getByRole("button", { name: "游玩", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(timeLegend.getByRole("listitem")).toHaveText(["游玩 11 小时 · 100%"]);
  await kinds.getByRole("button", { name: "全部类型" }).click();

  // 点一条：跳到时间线上的那件事（点开的那一类一直开着，按了「只看这一类」也不收）
  await expect(opened).toBeVisible();
  await opened.getByRole("button", { name: /^乌镇/ }).click();
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name: "时间线" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("toolbar", { name: "「乌镇」的操作" })).toBeVisible();

  // 开销那张卡片：点一类列出每一笔，收起
  await showView(page, "总览");
  await moneyCard.getByRole("button", { name: /^游玩 / }).click();
  const openedMoney = page.getByRole("region", { name: "游玩的开销" });
  await expect(openedMoney.getByRole("listitem")).toHaveText(["没写说明 ¥300 · 10.1 西湖", "没写说明 ¥450 · 10.2 乌镇"]);
  await openedMoney.getByRole("button", { name: "收起" }).click();
  await expect(openedMoney).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("手机上：两张卡片上下堆，点一类照样看得到", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 390, 844);
  await showView(page, "总览");

  const moneyCard = page.getByRole("region", { name: "开销总览" });
  const timeCard = page.getByRole("region", { name: "时间总览" });
  const [moneyBox, timeBox] = await Promise.all([moneyCard.boundingBox(), timeCard.boundingBox()]);
  expect(moneyBox!.y).toBeLessThan(timeBox!.y);
  expect(moneyBox!.x + moneyBox!.width).toBeLessThanOrEqual(390);

  await moneyCard.getByRole("button", { name: /^游玩 / }).click();
  await expect(page.getByRole("region", { name: "游玩的开销" }).getByRole("listitem")).toHaveCount(2);
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});
