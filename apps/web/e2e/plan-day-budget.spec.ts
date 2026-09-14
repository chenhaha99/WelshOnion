import { expect, test, type Locator, type Page } from "@playwright/test";
import { shot, watchErrors } from "./walkthrough";

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

test("时间预算：设默认 → 每天两行 → 填错 → 这天单独设 → 键盘收起 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();

  const days = page.getByRole("list", { name: "日期列表" }).getByRole("listitem");
  const day1 = days.nth(0);
  const day2 = days.nth(1);

  // 10.1 排两件事，夜游到半夜
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["西湖", "夜游"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await schedule(page, rows.nth(0), "西湖", "09:00", "3");
  await schedule(page, rows.nth(1), "夜游", "22:00", "2");
  await expect(day1.locator("[data-day-facts]")).toHaveText("09:00 起 · 24:00 收工");
  await expect(day1.locator("[data-day-budget]")).toHaveCount(0);

  // 设置里设默认：每天马上多一行「你设的」，不写超出
  await page.getByRole("button", { name: "国庆杭州" }).click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  await settings.getByLabel("几点起").fill("8:00");
  await page.keyboard.press("Enter");
  await settings.getByLabel("几点收工").fill("22:00");
  await page.keyboard.press("Enter");
  await expect(settings.getByLabel("几点起")).toHaveValue("08:00");
  await expect(day1.locator("[data-day-budget]")).toHaveText("你设的：08:00 起 · 22:00 收工");
  await expect(day2.locator("[data-day-budget]")).toHaveText("你设的：08:00 起 · 22:00 收工");
  await expect(page.getByText("超出")).toHaveCount(0);

  // 填错：栏下说明；清空后说明消失
  const km = settings.getByLabel("最多开多远（公里）");
  await km.fill("2.5");
  await page.keyboard.press("Enter");
  await expect(settings.getByText("要填不小于 0 的整数")).toBeVisible();
  // 电脑上还是右边 320 像素宽的抽屉，左边的计划页看得见
  const wideBox = (await settings.boundingBox())!;
  expect([wideBox.x + wideBox.width, wideBox.width]).toEqual([page.viewportSize()!.width, 320]);
  await shot(page, "01-settings");
  await km.fill("");
  await page.keyboard.press("Enter");
  await expect(settings.getByText("要填不小于 0 的整数")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  // 10.2 单独设：焦点在第一栏，淡字是计划的默认
  await day2.getByRole("button", { name: "这天的操作" }).click();
  await page.getByRole("menuitem", { name: "这天的时间预算…" }).click();
  const editor = day2.getByRole("group", { name: /的时间预算$/ });
  await expect(editor.getByLabel("几点起")).toBeFocused();
  await expect(editor.getByLabel("几点起")).toHaveAttribute("placeholder", "08:00");
  await expect(editor.getByLabel("最多开多久（小时）")).toHaveAttribute("placeholder", "不设");
  await editor.getByLabel("最多开多久（小时）").fill("4");
  await page.keyboard.press("Enter");
  await editor.getByLabel("最多开多远（公里）").fill("300");
  await page.keyboard.press("Enter");
  await expect(day2.locator("[data-day-budget]")).toHaveText(
    "你设的：08:00 起 · 22:00 收工 · 最多开 4 小时 · 最多开 300 公里",
  );
  await expect(day1.locator("[data-day-budget]")).toHaveText("你设的：08:00 起 · 22:00 收工");
  await shot(page, "02-day-budget");

  // 只用键盘收起：焦点回到这天的菜单按钮
  await page.keyboard.press("Escape");
  await expect(editor).toBeHidden();
  await expect(day2.getByRole("button", { name: "这天的操作" })).toBeFocused();

  // 矮的手机屏：设置占满屏幕、能滚，最后一栏够得着；滚到下面「关闭」还在屏幕里，点了关掉
  await page.setViewportSize({ width: 390, height: 640 });
  await page.getByRole("button", { name: "国庆杭州" }).click();
  const phoneBox = (await settings.boundingBox())!;
  expect([phoneBox.x, phoneBox.y, phoneBox.width, phoneBox.height]).toEqual([0, 0, 390, 640]);
  await km.scrollIntoViewIfNeeded();
  await expect(km).toBeInViewport();
  const close = settings.getByRole("button", { name: "关闭" });
  await expect(close).toBeInViewport();
  await shot(page, "03-mobile-settings");
  await close.click();
  await expect(settings).toBeHidden();

  // 手机上每天两行都只在项和项之间换行
  await page.setViewportSize({ width: 390, height: 844 });
  await day2.scrollIntoViewIfNeeded();
  for (const line of [day1.locator("[data-day-budget] span"), day2.locator("[data-day-budget] span")]) {
    expect(await line.evaluateAll((spans) => spans.every((span) => span.getClientRects().length === 1))).toBe(true);
  }
  await day1.screenshot({ path: test.info().outputPath("04-mobile-day1.png") });
  await day2.screenshot({ path: test.info().outputPath("05-mobile-day2.png") });

  expect(errors).toEqual([]);
});
