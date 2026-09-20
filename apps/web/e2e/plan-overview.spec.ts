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

/** 环是个圈，正中间是空的：按角度和半径算出圈上的一个点，把鼠标移过去。 */
async function hoverArc(page: Page, fraction: number, radius: number): Promise<void> {
  const box = (await page.locator("[data-dual-ring]").boundingBox())!;
  const scale = box.width / 340;
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  await page.mouse.move(box.x + (170 + Math.cos(angle) * radius) * scale, box.y + (170 + Math.sin(angle) * radius) * scale);
}

test("电脑上：同心双环 → 停在一类上两圈一起亮 → 点一类看明细 → 只看这一类 → 点一条跳过去", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 1280, 800);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });

  // 中间两行：钱和时间；外圈钱、内圈时间各三段（游玩、餐饮各一段，内圈末尾还有「还没排」）
  await expect(card.locator("[data-ring-money]")).toHaveText("¥750");
  await expect(card).toContainText("人均 ¥750");
  // 西湖 3 小时和午饭 1 小时叠了半小时，两件层一样高、各算各的；加上乌镇 8 小时
  await expect(card.locator("[data-ring-time]")).toHaveText("12 小时");
  await expect(card).toContainText("还有 2 小时没排");
  await expect(card.locator('[data-ring="money"]')).toHaveCount(1); // 只有游玩花了钱
  await expect(card.locator('[data-ring="time"]')).toHaveCount(2); // 游玩、餐饮
  await expect(card.locator('[data-ring="rest"]')).toHaveCount(1); // 还没排的那一段
  await expect(card.getByRole("list", { name: "按类型" }).getByRole("button")).toHaveText([
    "游玩 ¥750 · 100%",
    "餐饮 1 小时 · 8%",
  ]);
  await shot(page, "01-rings");

  // 停在外圈的「游玩」上：中间换成这一类的钱和时间
  await hoverArc(page, 0.25, 128);
  await expect(card.locator("[data-ring-money]")).toHaveText("¥750");
  // 两行：一行钱、一行时间
  await expect(card.locator("[data-ring-detail]")).toHaveText("100% 的钱11 小时 · 92% 的时间");
  await shot(page, "02-hover", { screen: true });

  // 点标签展开这一类：开销和事各一列
  await card.getByRole("button", { name: /^游玩 / }).click();
  const opened = page.getByRole("region", { name: "游玩的明细" });
  await expect(opened.getByRole("listitem")).toHaveText([
    "没写说明 ¥300 · 10.1 西湖",
    "没写说明 ¥450 · 10.2 乌镇",
    "西湖 10.1 09:00 · 3 小时",
    "乌镇 10.2 09:00 · 8 小时",
  ]);
  await shot(page, "03-opened");

  // 只看这一类：筛选那一排按下「游玩」
  await opened.getByRole("button", { name: "只看这一类" }).click();
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  await expect(kinds.getByRole("button", { name: "游玩", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByRole("list", { name: "按类型" }).getByRole("button")).toHaveText(["游玩 ¥750 · 100%"]);
  await kinds.getByRole("button", { name: "全部类型" }).click();

  // 点明细里的一条：跳到时间线上的那件事
  await expect(opened).toBeVisible();
  await opened.getByRole("button", { name: /^乌镇/ }).click();
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name: "时间线" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("toolbar", { name: "「乌镇」的操作" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：环占满宽度，标签不出屏幕，点一类照样看得到", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 390, 844);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });

  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await card.getByRole("button", { name: /^游玩 / }).click();
  await expect(page.getByRole("region", { name: "游玩的明细" }).getByRole("listitem")).toHaveCount(4);
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});

test("切角和刻度：浅色底上的那点未来感确实画出来了", async ({ page }) => {
  await trip(page, 1280, 800);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });

  // 四角的切角：卡片四角各一个，有边框色
  const corners = card.locator(".corner-bracket");
  await expect(corners).toHaveCount(4);
  const border = await corners.first().evaluate((node) => getComputedStyle(node).borderTopColor);
  expect(border).not.toBe("rgba(0, 0, 0, 0)");

  // 环外一圈刻度
  await expect(card.locator(".ring-tick")).toHaveCount(40);

  // 标签不压在下面的明细上：点开后，标签的底边在明细块上边之上
  await card.getByRole("button", { name: /^游玩 / }).click();
  const label = (await card.getByRole("button", { name: /^游玩 / }).boundingBox())!;
  const opened = (await page.getByRole("region", { name: "游玩的明细" }).boundingBox())!;
  expect(label.y + label.height).toBeLessThanOrEqual(opened.y + 1);
});
