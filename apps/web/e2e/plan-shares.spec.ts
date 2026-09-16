import { expect, test, type Locator, type Page } from "@playwright/test";
import { inOverview, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

async function pickKind(page: Page, row: Locator, kind: string): Promise<void> {
  await row.getByRole("button", { name: /^类型：/ }).click();
  // 选项旁边有「「餐饮」的操作」按钮，按名字找选项要精确匹配
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: kind, exact: true }).click();
}

async function schedule(page: Page, row: Locator, title: string, start: string, hours: string): Promise<void> {
  await expect(row.getByRole("textbox", { name: "标题" })).toHaveValue(title);
  await row.getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: `${title} 的时间` });
  await editor.getByLabel("开始").fill(start);
  await editor.getByRole("spinbutton", { name: "小时" }).fill(hours);
  await editor.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await editor.getByRole("button", { name: "排上时间" }).click();
  await expect(editor).toBeHidden();
}

test("占比：空计划 → 排时间 → 算上停留、勾选的出现和消失 → 填开销 → 定没定 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间轴：这份走查从安排表开始，先切到列表
  await showView(page, "列表");

  const card = page.getByRole("region", { name: "占比" });
  const moneyPart = card.getByRole("group", { name: "开销的占比" });
  const timePart = card.getByRole("group", { name: "时间的占比" });
  const statusPart = card.getByRole("group", { name: "定没定" });
  const baseLayer = timePart.getByRole("checkbox", { name: "算上最底层的类型（停留）" });

  // 空计划：三句「还没有」，没有勾选。占比卡片在第三个视图「总览」里
  await showView(page, "总览");
  await expect(moneyPart).toContainText("还没有填了金额的开销");
  await expect(timePart).toContainText("还没有排了时间的事");
  await expect(statusPart).toContainText("还没有事");
  await expect(timePart.getByRole("checkbox")).toHaveCount(0);
  await shot(page, "01-empty");

  // 三件事：在杭州（停留）、西湖（游玩）、午饭（餐饮）
  await showView(page, "列表");
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["在杭州", "西湖", "午饭"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  await pickKind(page, rows.nth(0), "停留");
  await pickKind(page, rows.nth(2), "餐饮");
  await inOverview(page, () => expect(statusPart).toContainText("3 件事：待定 3"));

  // 先只排停留：勾选出现，时间写「除了停留」
  await schedule(page, rows.nth(0), "在杭州", "00:00", "24");
  await showView(page, "总览");
  await expect(baseLayer).toBeVisible();
  await expect(timePart).toContainText("除了停留，还没有排了时间的事");

  await showView(page, "列表");
  await schedule(page, rows.nth(1), "西湖", "09:00", "3");
  await schedule(page, rows.nth(2), "午饭", "12:00", "1");
  await showView(page, "总览");
  await expect(timePart.getByRole("listitem")).toHaveText(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  await shot(page, "02-time");

  await baseLayer.check();
  await expect(timePart.getByRole("listitem")).toHaveText(["停留 20 小时 · 83%", "游玩 3 小时 · 13%", "餐饮 1 小时 · 4%"]);
  await shot(page, "03-with-stay");

  // 只用键盘取消勾选
  await baseLayer.focus();
  await page.keyboard.press("Space");
  await expect(baseLayer).not.toBeChecked();
  await expect(timePart.getByRole("listitem")).toHaveText(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);

  // 取消在杭州的时间：停留一分钟都没占到，勾选消失；撤销后回来
  await showView(page, "列表");
  await rows.nth(0).getByRole("button", { name: "时间" }).click();
  await page.getByRole("group", { name: "在杭州 的时间" }).getByRole("button", { name: "取消时间" }).click();
  await showView(page, "总览");
  await expect(timePart.getByRole("checkbox")).toHaveCount(0);
  await expect(timePart.getByRole("listitem")).toHaveText(["游玩 3 小时 · 75%", "餐饮 1 小时 · 25%"]);
  await page.keyboard.press("Control+z");
  await expect(baseLayer).toBeVisible();

  // 开销：西湖 300 和一笔只写了说明的打车；午饭 150；不属于任何一天的签证 600
  await showView(page, "列表");
  await expect(rows.nth(1).getByRole("textbox", { name: "标题" })).toHaveValue("西湖");
  await rows.nth(1).getByRole("button", { name: "开销" }).click();
  const lakeMoney = page.getByRole("group", { name: "西湖 的开销" });
  await expect(lakeMoney.getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();
  await page.keyboard.type("300");
  await page.keyboard.press("Enter");
  await lakeMoney.getByRole("textbox", { name: "新一笔的说明" }).fill("打车");
  await page.keyboard.press("Enter");
  await expect(lakeMoney.locator("[data-expense-id]")).toHaveCount(2);
  await page.keyboard.press("Escape");
  await expect(lakeMoney).toBeHidden();

  await expect(rows.nth(2).getByRole("textbox", { name: "标题" })).toHaveValue("午饭");
  await rows.nth(2).getByRole("button", { name: "开销" }).click();
  const lunchMoney = page.getByRole("group", { name: "午饭 的开销" });
  await expect(lunchMoney.getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();
  await page.keyboard.type("150");
  await page.keyboard.press("Enter");
  await expect(lunchMoney.locator("[data-expense-id]")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(lunchMoney).toBeHidden();

  await showView(page, "总览");
  const overview = page.getByRole("region", { name: "开销总览" });
  await overview.getByRole("button", { name: "不属于任何一天：¥0" }).click();
  const unattached = page.getByRole("group", { name: "不属于任何一天的开销" });
  await unattached.getByRole("textbox", { name: "新一笔的说明" }).fill("签证");
  await unattached.getByRole("textbox", { name: "新一笔的金额" }).fill("600");
  await page.keyboard.press("Enter");
  await expect(overview.getByRole("button", { name: "不属于任何一天：¥600" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(unattached).toBeHidden();

  await expect(moneyPart).toContainText("只算已填的 3 笔，还有 1 笔没填");
  await expect(moneyPart.getByRole("listitem")).toHaveText([
    "其他 ¥600 · 57%",
    "游玩 ¥300 · 29% · 还有 1 笔没填",
    "餐饮 ¥150 · 14%",
  ]);
  await expect(moneyPart.locator("[data-share-segment]")).toHaveCount(3);
  await shot(page, "04-money");

  // 定没定：西湖改成已确认
  await showView(page, "列表");
  await rows.nth(1).getByRole("button", { name: /^状态：/ }).click();
  await page.getByRole("dialog", { name: "选择状态" }).getByRole("button", { name: "已确认", exact: true }).click();
  await inOverview(page, () => expect(statusPart).toContainText("3 件事：待定 2 · 已确认 1"));

  await page.setViewportSize({ width: 390, height: 844 });
  await showView(page, "总览");
  await card.scrollIntoViewIfNeeded();
  const box = await card.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await card.screenshot({ path: test.info().outputPath("05-mobile-card.png") });
  await shot(page, "06-mobile");

  expect(errors).toEqual([]);
});
