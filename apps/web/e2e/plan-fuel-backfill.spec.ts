import { expect, test, type Locator, type Page } from "@playwright/test";
import { shot, watchErrors } from "./walkthrough";

/** 把这一行改成交通类，在详情里填自驾和距离，然后收起。 */
async function makeDrive(page: Page, row: Locator, title: string, km: string): Promise<void> {
  await row.getByRole("button", { name: /^类型：/ }).click();
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "交通", exact: true }).click();
  await row.getByRole("button", { name: "这件事的操作" }).click();
  await page.getByRole("menuitem", { name: "详情…" }).click();
  const details = page.getByRole("group", { name: `${title} 的详情` });
  await details.getByLabel("交通方式").selectOption("drive");
  await details.getByLabel("距离（公里）").fill(km);
  await page.keyboard.press("Enter");
  await details.getByRole("button", { name: "收起" }).click();
  await expect(details).toBeHidden();
}

test("事后补油费：先有自驾块 → 设每公里成本 → 问 → 只用键盘补上 → 撤销重做 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();

  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["去湖州", "去乌镇"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(2);

  // 每公里成本还空着：填了自驾和距离也不挂油费
  await makeDrive(page, rows.nth(0), "去湖州", "132");
  await makeDrive(page, rows.nth(1), "去乌镇", "30");
  await expect(rows.nth(0).locator("[data-money-cell]")).toHaveText("填钱");
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("填钱");

  // 设每公里成本：问一次，焦点留在这一栏
  await page.getByRole("button", { name: "国庆杭州" }).click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  const cost = settings.getByLabel("每公里成本（元）");
  await cost.fill("0.8");
  await page.keyboard.press("Enter");
  const prompt = settings.getByRole("group", { name: "补油费" });
  await expect(prompt).toContainText("给已有的 2 个自驾块补上油费吗？");
  await expect(cost).toBeFocused();
  await shot(page, "01-prompt");

  // 只用键盘：Tab 到「补上」回车
  await page.keyboard.press("Tab");
  await expect(prompt.getByRole("button", { name: "补上" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(prompt).toHaveCount(0);
  await settings.getByRole("button", { name: "关闭" }).click();
  await expect(settings).toBeHidden();
  await expect(rows.nth(0).locator("[data-money-cell]")).toHaveText("¥105.60");
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("¥24");
  await shot(page, "02-backfilled");

  // 补油费是一步：撤销两笔都没了，重做又回来
  await page.keyboard.press("Control+z");
  await expect(rows.nth(0).locator("[data-money-cell]")).toHaveText("填钱");
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("填钱");
  await page.keyboard.press("Control+Shift+z");
  await expect(rows.nth(0).locator("[data-money-cell]")).toHaveText("¥105.60");
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("¥24");

  await page.setViewportSize({ width: 390, height: 844 });
  await shot(page, "03-mobile");

  expect(errors).toEqual([]);
});
