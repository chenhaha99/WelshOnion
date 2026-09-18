import { expect, test, type Locator } from "@playwright/test";
import { DAY1, addBlocks, newPlan, pickKind, rowOf, schedule } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 时刻表里从上到下每一行：事写标题，空档写它那一行的字。 */
async function rowsOf(table: Locator): Promise<string[]> {
  return table.locator("tbody > tr").evaluateAll((rows) =>
    rows.flatMap((row) => {
      const title = row.querySelector<HTMLInputElement>("input[aria-label='标题']");
      if (title) return [title.value];
      if (row.hasAttribute("data-gap")) return [row.querySelector("button")?.textContent ?? ""];
      return [];
    }),
  );
}

test("电脑上的时刻表：左边开始时刻、竖线串起来、空档写一行 → 点空档加一件事 → 点圆圈划掉 → 住进民宿前空着的晚上", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 1280, height: 900 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["开车去杭州", "午饭", "民宿"]);
  await schedule(page, table, "开车去杭州", "08:00", "3");
  await schedule(page, table, "午饭", "12:30", "1");
  await schedule(page, table, "民宿", "21:00", "10");
  await pickKind(page, table, "民宿", "住宿");

  // 开车 08:00–11:00、午饭 12:30：中间空 1.5 小时；午饭 13:30 吃完到 21:00 住进民宿，空 7.5 小时
  expect(await rowsOf(table)).toEqual([
    "开车去杭州",
    "空 1.5 小时 · 在 11:00 加一件事",
    "午饭",
    "空 7.5 小时 · 在 13:30 加一件事",
    "民宿",
  ]);
  const drive = await rowOf(table, "开车去杭州");
  await expect(drive.locator("td").first()).toHaveText("08:00");
  await expect(drive.getByRole("button", { name: "时间" })).toHaveText("08:00–11:00");
  await expect(drive.locator("[data-block-duration]")).toHaveText("· 3 小时");
  // 圆圈在竖线上：开始时刻右边、卡片左边
  const time = (await drive.locator("td").first().boundingBox())!;
  const circle = (await drive.getByRole("checkbox", { name: "划掉" }).boundingBox())!;
  const card = (await drive.locator(".schedule-card").boundingBox())!;
  expect(circle.x).toBeGreaterThanOrEqual(time.x + time.width - 1);
  expect(circle.x + circle.width).toBeLessThanOrEqual(card.x + 1);
  await shot(page, "01-desktop-schedule");

  // 点第一行空档：弹「加一件事」，写着 11:00–12:00；回车建出来，框关掉，焦点在新那件的标题上
  await table.getByRole("button", { name: "空 1.5 小时 · 在 11:00 加一件事" }).click();
  const dialog = page.getByRole("dialog", { name: "加一件事" });
  await expect(dialog).toContainText("第 1 天 · 10.1 周四 · 11:00–12:00");
  await dialog.getByRole("textbox", { name: "加一件事" }).fill("雷峰塔");
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  const tower = await rowOf(table, "雷峰塔");
  await expect(tower.getByRole("textbox", { name: "标题" })).toBeFocused();
  await expect(tower.getByRole("button", { name: "时间" })).toHaveText("11:00–12:00");
  expect(await rowsOf(table)).toEqual([
    "开车去杭州",
    "雷峰塔",
    "空 30 分钟 · 在 12:00 加一件事",
    "午饭",
    "空 7.5 小时 · 在 13:30 加一件事",
    "民宿",
  ]);

  // 点「午饭」的圆圈：划掉，卡片左边一道变虚线、标题划一道
  const lunch = await rowOf(table, "午饭");
  await lunch.getByRole("checkbox", { name: "划掉" }).click();
  await expect(lunch).toHaveAttribute("data-checked", "true");
  await expect(lunch.getByRole("checkbox", { name: "划掉" })).toBeChecked();
  expect(await lunch.locator(".schedule-card").evaluate((node) => getComputedStyle(node).borderLeftStyle)).toBe("dashed");
  await page.mouse.click(5, 5);
  expect(
    await lunch.getByRole("textbox", { name: "标题" }).evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe("line-through");
  await shot(page, "02-desktop-added-struck");

  expect(errors).toEqual([]);
});
