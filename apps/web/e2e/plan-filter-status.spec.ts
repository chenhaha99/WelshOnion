import { expect, test } from "@playwright/test";
import { shot, watchErrors } from "./walkthrough";

test("按状态筛选：只看待定 → 只用键盘挨个确认 → 全部显示 → 手机", async ({ page }) => {
  const errors = watchErrors(page);

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("国庆杭州");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("2");
  await page.getByRole("button", { name: "确定" }).click();

  const day1 = page.getByRole("list", { name: "日期列表" }).getByRole("listitem").nth(0);
  const table = page.getByRole("table", { name: /10\.1 周四 的安排/ });
  const rows = table.locator("tr[data-block-id]");
  const filteredOut = table.locator("[data-filtered-out]");
  await table.getByRole("textbox", { name: "加一件事" }).click();
  for (const title of ["西湖", "午饭", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(3);
  const picker = page.getByRole("dialog", { name: "选择状态" });
  await rows.nth(1).getByRole("button", { name: /^状态：/ }).click();
  await picker.getByRole("button", { name: "已确认", exact: true }).click();
  await expect(rows.nth(1).getByRole("button", { name: "状态：已确认" })).toBeVisible();

  // 只看待定的：表、占比一起变
  const filter = page.getByRole("group", { name: "按状态筛选" });
  const pending = filter.getByRole("button", { name: "待定", exact: true });
  await pending.click();
  await expect(pending).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(2);
  await expect(filteredOut).toHaveText("筛掉了 1 件");
  await expect(page.getByRole("region", { name: "占比" }).getByRole("group", { name: "定没定" })).toContainText(
    "2 件事：待定 2",
  );
  await shot(page, "01-only-pending");

  // 只用键盘挨个确认：状态按钮回车打开选择器，Tab 到「已确认」回车；这一行消失，焦点落到下一行的状态按钮
  await rows.nth(0).getByRole("button", { name: /^状态：/ }).focus();
  for (const remaining of [1, 0]) {
    await page.keyboard.press("Enter");
    await expect(picker.getByRole("button", { name: "待定", exact: true })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(picker.getByRole("button", { name: "已确认", exact: true })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(rows).toHaveCount(remaining);
    if (remaining > 0) await expect(rows.nth(0).getByRole("button", { name: /^状态：/ })).toBeFocused();
  }
  await expect(filteredOut).toHaveText("筛掉了 3 件");
  // 一行都不剩：焦点落到这天的菜单按钮（不进输入框，Ctrl+Z 照样能用）
  await expect(day1.getByRole("button", { name: "这天的操作" })).toBeFocused();
  await shot(page, "02-all-confirmed");

  // 全部显示
  await filter.getByRole("button", { name: "全部显示" }).click();
  await expect(rows).toHaveCount(3);
  await expect(filteredOut).toHaveCount(0);
  await expect(filter.getByRole("button", { name: "全部显示" })).toHaveCount(0);

  // 手机：按钮一排放不下就换行，不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await filter.getByRole("button", { name: "已确认", exact: true }).click();
  await expect(rows).toHaveCount(3);
  const box = await filter.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await shot(page, "03-mobile");

  expect(errors).toEqual([]);
});
