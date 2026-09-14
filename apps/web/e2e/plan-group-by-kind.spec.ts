import { expect, test, type Locator } from "@playwright/test";
import { DAY1, DAY2, addBlocks, addMoney, newPlan, pickKind } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 类型组里说明是 note 的那一行钱。 */
async function moneyRow(group: Locator, note: string): Promise<Locator> {
  const id = await group
    .locator("[data-expense-id]")
    .evaluateAll(
      (rows, wanted) =>
        rows
          .find((row) => row.querySelector<HTMLInputElement>('input[aria-label="说明"]')?.value === wanted)
          ?.getAttribute("data-expense-id") ?? null,
      note,
    );
  if (id === null) throw new Error(`组里没有「${note}」`);
  return group.locator(`[data-expense-id="${id}"]`);
}

test("按类型分组：按天建块挂钱 → 切到按类型 → 空行填钱 → 改类型换组 → 删掉那笔变回空行 → 手机", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 2);
  const day1 = page.getByRole("table", { name: DAY1 });
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1, ["民宿", "横店"]);
  await pickKind(page, day1, "民宿", "住宿");
  await addBlocks(page, day2, ["午饭"]);
  await pickKind(page, day2, "午饭", "餐饮");
  await addMoney(page, day1, "民宿", "480", { note: "房费" });
  await addMoney(page, day1, "横店", "300", { kind: "住宿", note: "住宿费" });

  // 切到按类型：住宿组两笔、写挂在哪；餐饮组是午饭的空行；每天的安排表不见
  await page.getByRole("group", { name: "分组" }).getByRole("button", { name: "按类型" }).click();
  const groups = page.getByRole("list", { name: "类型分组" });
  await expect(groups.getByRole("listitem")).toHaveCount(2);
  await expect(page.getByRole("list", { name: "日期列表" })).toHaveCount(0);
  const lodging = groups.getByRole("listitem", { name: "住宿" });
  const food = groups.getByRole("listitem", { name: "餐饮" });
  await expect(lodging.locator("[data-group-summary]")).toHaveText("¥780 · 2 笔");
  await expect((await moneyRow(lodging, "住宿费")).locator("[data-expense-blocks]")).toHaveText("挂在 10.1 周四 横店");
  await expect(food.locator("[data-empty-block-id] [data-block-label]")).toHaveText("10.2 周五 午饭");
  await shot(page, "01-by-kind");

  // 空行填钱：变成钱的一行
  await food.locator("[data-empty-block-id]").getByRole("textbox", { name: "新一笔的金额" }).fill("45");
  await page.keyboard.press("Enter");
  await expect(food.locator("[data-group-summary]")).toHaveText("¥45 · 1 笔");
  await expect(food.locator("[data-empty-block-id]")).toHaveCount(0);

  // 改类型换组：住宿费改成游玩，焦点跟过去
  await (await moneyRow(lodging, "住宿费")).getByRole("button", { name: /^类型：/ }).click();
  await page.getByRole("dialog", { name: "选择类型" }).getByRole("button", { name: "游玩", exact: true }).click();
  const sight = groups.getByRole("listitem", { name: "游玩" });
  await expect(sight.locator("[data-expense-id]")).toHaveCount(1);
  await expect(sight.getByRole("button", { name: "类型：游玩" })).toBeFocused();
  await expect(lodging.locator("[data-group-summary]")).toHaveText("¥480 · 1 笔");

  // 删掉那笔：横店一笔钱都没了，在游玩组里变回空行
  await sight.getByRole("button", { name: "删除这笔" }).click();
  await expect(sight.locator("[data-expense-id]")).toHaveCount(0);
  await expect(sight.locator("[data-empty-block-id] [data-block-label]")).toHaveText("10.1 周四 横店");
  await shot(page, "02-after-edits");

  // 手机：类型分组不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(lodging).toBeVisible();
  const box = (await groups.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "03-mobile");

  expect(errors).toEqual([]);
});
