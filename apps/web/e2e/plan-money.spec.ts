import { expect, test } from "@playwright/test";
import { inOverview, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("开销：填第一笔 → 一块多笔 → 不属于任何一天 → 总览 → 撤销 → 只用键盘 → 手机", async ({ page }) => {
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

  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["西湖", "午饭", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  await rows.nth(1).getByRole("button", { name: /^类型：/ }).click();
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "餐饮", exact: true }).click();

  // 西湖：点开销格，焦点直接在金额框里，填 300 回车
  await rows.nth(0).getByRole("button", { name: "开销" }).click();
  const lakeMoney = page.getByRole("group", { name: "西湖 的开销" });
  await expect(lakeMoney.getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();
  await page.keyboard.type("300");
  await page.keyboard.press("Enter");
  await expect(rows.nth(0).locator("[data-money-cell]")).toHaveText("¥300");
  await shot(page, "01-first-money");
  await page.keyboard.press("Escape");
  await expect(lakeMoney).toBeHidden();

  // 午饭：一块两笔
  await rows.nth(1).getByRole("button", { name: "开销" }).click();
  const lunchMoney = page.getByRole("group", { name: "午饭 的开销" });
  for (const [amount, note] of [
    ["120", "面"],
    ["38.5", "奶茶"],
  ] as const) {
    await lunchMoney.getByRole("textbox", { name: "新一笔的金额" }).fill(amount);
    await lunchMoney.getByRole("textbox", { name: "新一笔的说明" }).fill(note);
    await page.keyboard.press("Enter");
  }
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("¥158.50 · 2 笔");
  await expect(lunchMoney.locator("[data-expense-id]")).toHaveCount(2);
  await shot(page, "02-two-entries");
  await page.keyboard.press("Escape");
  await expect(lunchMoney).toBeHidden();

  // 不属于任何一天：签证 600。开销总览在第三个视图「总览」里
  await showView(page, "总览");
  const overview = page.getByRole("region", { name: "开销总览" });
  await overview.getByRole("button", { name: "不属于任何一天：¥0" }).click();
  const unattached = page.getByRole("group", { name: "不属于任何一天的开销" });
  await unattached.getByRole("textbox", { name: "新一笔的说明" }).fill("签证");
  await unattached.getByRole("textbox", { name: "新一笔的金额" }).fill("600");
  await page.keyboard.press("Enter");
  await expect(overview.getByRole("button", { name: "不属于任何一天：¥600" })).toBeVisible();
  await expect(overview.locator("[data-money-summary]")).toHaveText(
    "总额 ¥1,058.50 · 人均 ¥1,058.50 · 已填 4 / 共 4 笔 · 另有 1 件事还没填开销",
  );
  await shot(page, "03-overview");

  // 收起后撤销：签证那笔没了
  await page.keyboard.press("Escape");
  await expect(unattached).toBeHidden();
  await page.keyboard.press("Control+z");
  await expect(overview.getByRole("button", { name: "不属于任何一天：¥0" })).toBeVisible();

  // 只用键盘：灵隐寺的开销格回车打开，填 45 回车
  await showView(page, "列表");
  await rows.nth(2).getByRole("button", { name: "开销" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "灵隐寺 的开销" }).getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();
  await page.keyboard.type("45");
  await page.keyboard.press("Enter");
  await expect(rows.nth(2).locator("[data-money-cell]")).toHaveText("¥45");
  await inOverview(page, ({ summary }) =>
    expect(summary).toHaveText("总额 ¥503.50 · 人均 ¥503.50 · 已填 4 / 共 4 笔"),
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});
