import { expect, test } from "@playwright/test";
import { DAY1, addBlocks, newPlan } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("计划设置是居中的窗口：页顶三个图标 → 点暗底关掉 → 在设置里改类型 → 手机上占满屏幕", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  await addBlocks(page, page.getByRole("table", { name: DAY1 }), ["西湖"]);

  // 页顶三个图标：名字只在读屏名和提示里
  const settingsButton = page.getByRole("button", { name: "计划设置", exact: true });
  await expect(settingsButton).toHaveText("");
  await expect(page.getByRole("button", { name: "撤销" })).toHaveText("");
  await expect(page.getByRole("button", { name: "重做" })).toHaveText("");

  // 打开：居中、最宽 560 像素、上下留白
  await settingsButton.click();
  const settings = page.getByRole("dialog", { name: "计划设置" });
  const box = (await settings.boundingBox())!;
  expect(Math.round(box.width)).toBeLessThanOrEqual(560);
  expect(Math.abs(box.x - (1280 - box.width - box.x - box.x)) < 2 || Math.abs(box.x + box.width / 2 - 640) < 2).toBe(true);
  expect(box.y).toBeGreaterThan(0);
  await shot(page, "01-settings-window");

  // 在设置里把「游玩」改名
  const kinds = settings.getByRole("group", { name: "类型的管理" });
  await expect(kinds.getByText("这个计划里 1 件在用").first()).toBeVisible();
  await kinds.getByRole("button", { name: "改名：游玩" }).click();
  const name = kinds.getByRole("textbox", { name: "新名字" });
  await name.fill("玩");
  await page.keyboard.press("Enter");
  await expect(kinds.getByRole("button", { name: "改名：玩" })).toBeVisible();

  // 点暗底关掉，焦点回到「计划设置」
  await page.mouse.click(20, 400);
  await expect(settings).toBeHidden();
  await expect(settingsButton).toBeFocused();
  await expect(page.getByRole("table", { name: DAY1 }).getByRole("button", { name: "类型：玩" })).toBeVisible();

  // 手机上占满屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await settingsButton.click();
  const phone = (await settings.boundingBox())!;
  expect(Math.round(phone.x)).toBe(0);
  expect(Math.round(phone.width)).toBe(390);
  expect(Math.round(phone.height)).toBe(844);
  await shot(page, "02-settings-phone");

  expect(errors).toEqual([]);
});
