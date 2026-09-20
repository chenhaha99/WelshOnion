import { expect, test, type Locator, type Page } from "@playwright/test";
import { showView } from "./timeline-helpers";
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

test("块的详情：键盘打开详情填备注 → 交通块自驾挂油费 → 只存时长 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");

  // 先设每公里成本，自驾填齐时才会挂油费
  await page.getByRole("button", { name: "国庆杭州" }).click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  await settings.getByLabel("每公里成本（元）").fill("0.8");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  const day1 = page.getByRole("list", { name: "每天" }).getByRole("listitem").nth(0);
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["西湖", "去乌镇", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  await rows.nth(1).getByRole("button", { name: /^类型：/ }).click();
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "交通", exact: true }).click();

  // 西湖：只用键盘打开详情面板，填短备注和两行长备注，Esc 关掉面板后焦点回到行菜单按钮
  const lakeMenu = rows.nth(0).getByRole("button", { name: "这件事的操作" });
  await lakeMenu.focus();
  await page.keyboard.press("Enter");
  const detailsItem = page.getByRole("menuitem", { name: "详情…" });
  for (let step = 0; step < 5 && !(await detailsItem.evaluate((item) => item === document.activeElement)); step++) {
    await page.keyboard.press("ArrowDown");
  }
  await expect(detailsItem).toBeFocused();
  await page.keyboard.press("Enter");
  const lakeDetails = page.getByRole("group", { name: "西湖 的详情" });
  // 打开时焦点在标题框上；两个备注都空着时收起着，Tab 到「加备注」按回车才摊开
  await expect(page.getByRole("dialog", { name: "西湖" }).getByLabel("标题")).toBeFocused();
  await lakeDetails.getByRole("button", { name: "加备注" }).focus();
  await page.keyboard.press("Enter");
  await expect(lakeDetails.getByLabel("短备注")).toBeFocused();
  await expect(lakeDetails.getByLabel("交通方式")).toHaveCount(0);
  await page.keyboard.type("看落日");
  await page.keyboard.press("Enter");
  await lakeDetails.getByLabel("长备注").fill("北山街停车\n傍晚去断桥");
  await page.keyboard.press("Tab");
  await expect(rows.nth(0).locator("[data-block-subtitle]")).toHaveText("看落日 · 有长备注");
  await shot(page, "01-details");
  await page.keyboard.press("Escape");
  await expect(lakeDetails).toBeHidden();
  await expect(lakeMenu).toBeFocused();

  // 去乌镇（交通）：详情里直接有路程，自驾 132 公里，开销格马上出现油费
  await rows.nth(1).getByRole("button", { name: "这件事的操作" }).click();
  await detailsItem.click();
  const routeDetails = page.getByRole("group", { name: "去乌镇 的详情" });
  await routeDetails.getByLabel("交通方式").selectOption("drive");
  await routeDetails.getByLabel("距离（公里）").fill("132");
  await page.keyboard.press("Enter");
  await expect(rows.nth(1).locator("[data-money-cell]")).toHaveText("¥105.60");
  await page.getByRole("dialog", { name: "去乌镇" }).getByRole("button", { name: "关闭" }).click();
  await expect(routeDetails).toBeHidden();

  // 去乌镇排上 08:00 起 2 小时；灵隐寺只存 2 小时时长
  await schedule(page, rows.nth(1), "去乌镇", "08:00", "2");
  await expect(rows.nth(2).getByRole("textbox", { name: "标题" })).toHaveValue("灵隐寺");
  await rows.nth(2).getByRole("button", { name: "时间" }).click();
  const templeTime = page.getByRole("group", { name: "灵隐寺 的时间" });
  await templeTime.getByRole("spinbutton", { name: "小时" }).fill("2");
  await templeTime.getByRole("spinbutton", { name: "分钟" }).fill("0");
  await templeTime.getByRole("button", { name: "只存时长" }).click();
  await expect(templeTime).toBeHidden();
  await expect(rows.nth(2).locator("[data-block-time]")).toHaveText("整天 · 2 小时");
  await expect(day1.locator("[data-day-facts]")).toHaveText(
    "08:00 起 · 10:00 收工 · 自驾 2 小时 132 公里 · 还有 2 小时没排 · 花 ¥105.60",
  );
  await shot(page, "02-after");

  await page.setViewportSize({ width: 390, height: 844 });
  await rows.nth(1).getByRole("button", { name: "这件事的操作" }).click();
  await detailsItem.click();
  await expect(lakeDetails).toBeVisible();
  await shot(page, "03-mobile-details");

  expect(errors).toEqual([]);
});
