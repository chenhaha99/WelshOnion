import { expect, test } from "@playwright/test";
import { DAY1, addBlocks, addMoney, newPlan, pickKind, rowOf, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

test("按类型筛选：只看住宿 → 钱格另有别的类型、挂在被筛掉的事上 → 和状态一起 → 全部类型 → 手机", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1);
  const table = page.getByRole("table", { name: DAY1 });
  const rows = table.locator("tr[data-block-id]");
  await addBlocks(page, table, ["民宿", "横店", "午饭"]);
  await pickKind(page, table, "民宿", "住宿");
  await pickKind(page, table, "午饭", "餐饮");
  await schedule(page, table, "民宿", "22:00", "2");
  // 民宿：房费 480、早餐 30（餐饮）；横店（游玩）：住宿费 300（住宿）
  await addMoney(page, table, "民宿", "480");
  await addMoney(page, table, "民宿", "30", { kind: "餐饮" });
  await addMoney(page, table, "横店", "300", { kind: "住宿" });

  // 「类型」那一排只列用到的，按类型的顺序
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  await expect(kinds.getByRole("button")).toHaveText(["住宿", "餐饮", "游玩"]);

  // 只看住宿：表只剩民宿；钱格只算住宿、另写一行；上面写挂在被筛掉的事上的钱；总览只算住宿；时间轴只画民宿
  await kinds.getByRole("button", { name: "住宿", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(table.locator("[data-filtered-out]")).toHaveText("筛掉了 2 件");
  const inn = await rowOf(table, "民宿");
  await expect(inn.locator("[data-money-cell]")).toHaveText("¥480");
  await expect(inn.locator("[data-money-note]")).toHaveText("另有别的类型的钱");
  await expect(page.getByText("有 ¥300 挂在被筛掉的事上")).toBeVisible();
  await expect(page.getByRole("region", { name: "钱的总览" })).toContainText("总额 ¥780");
  await showView(page, "时间轴");
  await expect(page.getByRole("region", { name: "时间轴" }).locator("[data-segment]")).toHaveCount(1);
  await showView(page, "列表");
  await shot(page, "01-lodging-only");

  // 和状态一起：民宿还是待定，再按「已确认」，一件都不显示；取消状态
  const statuses = page.getByRole("group", { name: "按状态筛选" });
  await statuses.getByRole("button", { name: "已确认", exact: true }).click();
  await expect(rows).toHaveCount(0);
  await expect(table.locator("[data-filtered-out]")).toHaveText("筛掉了 3 件");
  await statuses.getByRole("button", { name: "全部显示" }).click();
  await expect(rows).toHaveCount(1);

  // 全部类型：都回来，上面那一句和钱格下面那一行都不见
  await kinds.getByRole("button", { name: "全部类型" }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.getByText(/挂在被筛掉的事上/)).toHaveCount(0);
  await expect((await rowOf(table, "民宿")).locator("[data-money-note]")).toHaveCount(0);

  // 手机：两排按钮放不下就换行，不撑出屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  await kinds.getByRole("button", { name: "住宿", exact: true }).click();
  await expect(rows).toHaveCount(1);
  const box = (await kinds.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await shot(page, "02-mobile");

  expect(errors).toEqual([]);
});
