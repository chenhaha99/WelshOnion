import { expect, test } from "@playwright/test";
import { DAY1, DAY2, addBlocks, addMoney, newPlan, pickKind } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("按类型加钱：组末尾加一笔挂到一块 → 不挂块排在最后 → 加一笔别的类型 → 手机", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1 = page.getByRole("table", { name: DAY1 });
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1, ["民宿"]);
  await pickKind(page, day1, "民宿", "住宿");
  await addBlocks(page, day2, ["酒店"]);
  await pickKind(page, day2, "酒店", "住宿");
  await addMoney(page, day1, "民宿", "480", { note: "房费" });
  await page.getByRole("group", { name: "分组" }).getByRole("button", { name: "按类型" }).click();
  const groups = page.getByRole("list", { name: "类型分组" });
  const lodging = groups.getByRole("listitem", { name: "住宿" });
  const addRow = lodging.locator("[data-add-row]");

  // 组末尾加一笔，挂到民宿：组里多一行，写挂在 10.1 周四 民宿；填完清空，焦点还在金额
  await addRow.getByRole("combobox", { name: "挂到" }).selectOption({ label: "10.1 周四 民宿" });
  await addRow.getByRole("textbox", { name: "新一笔的说明" }).fill("第二晚");
  await addRow.getByRole("textbox", { name: "新一笔的金额" }).fill("300");
  await page.keyboard.press("Enter");
  await expect(lodging.locator("[data-group-summary]")).toHaveText("¥780 · 2 笔");
  await expect(lodging.locator("[data-expense-blocks]")).toHaveText(["挂在 10.1 周四 民宿", "挂在 10.1 周四 民宿"]);
  await expect(addRow.getByRole("combobox", { name: "挂到" })).toHaveValue("");
  await expect(addRow.getByRole("textbox", { name: "新一笔的金额" })).toBeFocused();

  // 不挂块：排在组的最后
  await addRow.getByRole("textbox", { name: "新一笔的说明" }).fill("服务费");
  await addRow.getByRole("textbox", { name: "新一笔的金额" }).fill("20");
  await page.keyboard.press("Enter");
  await expect(lodging.locator("[data-group-summary]")).toHaveText("¥800 · 3 笔");
  await expect(lodging.locator("[data-expense-blocks]").last()).toHaveText("不挂块");
  await shot(page, "01-add-in-group");

  // 加一笔别的类型的钱：选购物，购物组出现
  const others = page.getByRole("region", { name: "加一笔别的类型的钱" });
  await others.getByRole("combobox", { name: "类型" }).selectOption({ label: "购物" });
  await others.getByRole("textbox", { name: "新一笔的金额" }).fill("99");
  await page.keyboard.press("Enter");
  await expect(groups.getByRole("listitem", { name: "购物" }).locator("[data-group-summary]")).toHaveText("¥99 · 1 笔");

  // 手机：加一笔的几格换行，不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(addRow).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "02-mobile");

  expect(errors).toEqual([]);
});
