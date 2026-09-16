import { expect, test } from "@playwright/test";
import { showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 选项和「改名」这类按钮的名字会互相包含，按名字找一律精确匹配
test("类型和状态：选择器里新建并用上 → 设置里改色、删除 → 新建状态 → 键盘 → 手机", async ({ page }) => {
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
  for (const title of ["西湖", "灵隐寺"]) {
    await page.keyboard.type(title);
    await page.keyboard.press("Enter");
  }
  await expect(rows).toHaveCount(2);

  // 打开类型选择器：焦点落在当前选中的「游玩」上
  await rows.nth(0).getByRole("button", { name: "类型：游玩" }).click();
  const kindPicker = page.getByRole("dialog", { name: "选择类型" });
  await expect(kindPicker.getByRole("button", { name: "游玩", exact: true })).toBeFocused();
  await shot(page, "01-kind-picker");

  await kindPicker.getByRole("button", { name: "+ 新建类型" }).click();
  await kindPicker.getByRole("textbox", { name: "名字" }).fill("门票");
  // 新建表单展开在面板最底下，「确定」要滚进看得见的地方
  await expect(kindPicker.getByRole("button", { name: "确定", exact: true })).toBeInViewport();
  await shot(page, "02-create-form");
  await kindPicker.getByRole("button", { name: "确定", exact: true }).click();
  await expect(rows.nth(0).getByRole("button", { name: "类型：门票" })).toBeVisible();
  await expect(rows.nth(0).getByRole("button", { name: "类型：门票" })).toBeFocused();

  await rows.nth(1).getByRole("button", { name: /^类型：/ }).click();
  await kindPicker.getByRole("button", { name: "门票", exact: true }).click();
  await expect(rows.nth(1).getByRole("button", { name: "类型：门票" })).toBeVisible();

  // 选择器里只有选和新建，改名改色删除在设置里（面板底部写着）
  await rows.nth(0).getByRole("button", { name: /^类型：/ }).click();
  await expect(kindPicker.getByText("改名、改颜色、删除在计划设置里")).toBeVisible();
  await expect(kindPicker.getByRole("button", { name: "「门票」的操作" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // 到设置里改颜色：设置里写着这个计划用了几件
  const settingsButton = page.getByRole("button", { name: "计划设置", exact: true });
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  const kindManager = settings.getByRole("group", { name: "类型的管理" });
  await expect(settings.getByText("所有计划共用", { exact: false })).toBeVisible();
  await expect(kindManager.getByText("这个计划里 2 件在用").first()).toBeVisible();
  await shot(page, "03-settings-library");
  await kindManager.getByRole("button", { name: "改颜色：门票" }).click();
  await kindManager.getByRole("button", { name: "颜色 #c08d68" }).click();

  // 接着删掉它：先说明在用个数，确认后两块都写「已删除的类型」
  await kindManager.getByRole("button", { name: "删除：门票" }).click();
  await expect(kindManager.getByText("这个计划里有 2 件事在用", { exact: false })).toBeVisible();
  await shot(page, "04-delete-confirm");
  await kindManager.getByRole("button", { name: "删除", exact: true }).click();
  await expect(kindManager.getByRole("button", { name: "改名：门票" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();
  await expect(settingsButton).toBeFocused();
  await expect(rows.nth(0).getByRole("button", { name: "类型：已删除的类型" })).toBeVisible();
  await expect(rows.nth(1).getByRole("button", { name: "类型：已删除的类型" })).toBeVisible();
  await shot(page, "05-after-delete");

  // 新建状态「已预订」并用上
  await rows.nth(0).getByRole("button", { name: "状态：待定" }).click();
  const statusPicker = page.getByRole("dialog", { name: "选择状态" });
  await statusPicker.getByRole("button", { name: "+ 新建状态" }).click();
  await statusPicker.getByRole("textbox", { name: "名字" }).fill("已预订");
  await page.keyboard.press("Enter");
  await expect(rows.nth(0).getByRole("button", { name: "状态：已预订" })).toBeVisible();
  await expect(rows.nth(0)).toHaveAttribute("data-pending", "false");

  // 只用键盘：回车打开，Esc 关掉，焦点回到按钮
  const secondKind = rows.nth(1).getByRole("button", { name: /^类型：/ });
  await secondKind.focus();
  await page.keyboard.press("Enter");
  await expect(kindPicker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(kindPicker).toBeHidden();
  await expect(secondKind).toBeFocused();
  await shot(page, "06-desktop-done");

  await page.setViewportSize({ width: 390, height: 844 });
  await rows.nth(1).getByRole("button", { name: /^类型：/ }).click();
  await expect(kindPicker).toBeVisible();
  const box = await kindPicker.boundingBox();
  expect(box !== null && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await shot(page, "07-mobile-picker");

  expect(errors).toEqual([]);
});
