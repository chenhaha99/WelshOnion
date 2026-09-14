import { expect, test, type Page } from "@playwright/test";

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: true });
}

// 每个选项旁边都有「「名字」的操作」按钮，按名字找选项时一律精确匹配
test("类型和状态：新建并用上 → 改色 → 删除确认 → 新建状态 → 键盘 → 手机", async ({ page }) => {
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

  // 改颜色：选完回到列表，选择器还开着
  await rows.nth(0).getByRole("button", { name: /^类型：/ }).click();
  await kindPicker.getByRole("button", { name: "「门票」的操作" }).click();
  await kindPicker.getByRole("menuitem", { name: "改颜色…" }).click();
  await kindPicker.getByRole("button", { name: "颜色 #c08d68" }).click();
  await expect(rows.nth(0)).toHaveAttribute("style", /#c08d68/);
  await expect(kindPicker).toBeVisible();

  // 删除：先说明在用个数，确认后两块都写「已删除的类型」，选择器还开着
  await kindPicker.getByRole("button", { name: "「门票」的操作" }).click();
  await kindPicker.getByRole("menuitem", { name: "删除…" }).click();
  await expect(kindPicker.getByText("这个计划里有 2 个块在用", { exact: false })).toBeVisible();
  await shot(page, "03-delete-confirm");
  await kindPicker.getByRole("button", { name: "删除", exact: true }).click();
  await expect(rows.nth(0).getByRole("button", { name: "类型：已删除的类型" })).toBeVisible();
  await expect(rows.nth(1).getByRole("button", { name: "类型：已删除的类型" })).toBeVisible();
  await expect(kindPicker.getByRole("button", { name: "门票", exact: true })).toHaveCount(0);
  await shot(page, "04-after-delete");
  await page.keyboard.press("Escape");
  await expect(kindPicker).toBeHidden();
  await expect(rows.nth(0).getByRole("button", { name: "类型：已删除的类型" })).toBeFocused();

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
  await shot(page, "05-desktop-done");

  await page.setViewportSize({ width: 390, height: 844 });
  await rows.nth(1).getByRole("button", { name: /^类型：/ }).click();
  await expect(kindPicker).toBeVisible();
  const box = await kindPicker.boundingBox();
  expect(box !== null && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  await shot(page, "06-mobile-picker");

  expect(errors).toEqual([]);
});
