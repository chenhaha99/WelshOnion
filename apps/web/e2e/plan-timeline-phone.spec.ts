import { expect, test, type Page } from "@playwright/test";
import { DAY1, DAY2, DAY3, addBlocks, newPlan, pickKind, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 三天：第 1 天排满、夜里还有夜车；第 2 天两段；第 3 天一段 */
async function trip(page: Page): Promise<void> {
  await newPlan(page, 3, { width: 360, height: 844 });
  const d1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, d1, ["早饭", "西湖", "午饭", "买咖啡", "灵隐寺", "夜车去苏州", "没排的一件"]);
  for (const [title, kind] of [["早饭", "餐饮"], ["午饭", "餐饮"], ["买咖啡", "餐饮"], ["夜车去苏州", "交通"]] as const) {
    await pickKind(page, d1, title, kind);
  }
  await schedule(page, d1, "早饭", "07:00", "1");
  await schedule(page, d1, "西湖", "09:00", "3");
  await schedule(page, d1, "午饭", "12:30", "1");
  await schedule(page, d1, "买咖啡", "14:00", "0", "20");
  await schedule(page, d1, "灵隐寺", "15:00", "3");
  await schedule(page, d1, "夜车去苏州", "20:00", "10", "10");
  const d2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, d2, ["苏州园林", "平江路"]);
  await schedule(page, d2, "苏州园林", "09:00", "3");
  await schedule(page, d2, "平江路", "14:00", "3");
  const d3 = page.getByRole("table", { name: DAY3 });
  await addBlocks(page, d3, ["寒山寺"]);
  await schedule(page, d3, "寒山寺", "10:00", "2");
}

test("手机上的时间线：一天一条横的 → 每天的条一样宽 → 展开那天字排在下面、点对准块的左边 → 点另一天展开 → 点色块浮出快捷条 → 没展开的天点色块是展开 → 条上写管下面的字", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page);
  await showView(page, "时间线");
  const region = page.getByRole("region", { name: "时间线" });
  const days = region.getByRole("list", { name: "每天" }).getByRole("listitem");

  // 三天都在，一天一行
  await expect(days).toHaveCount(3);
  await expect(days.first()).toHaveAttribute("data-open", "true");

  // 所有天共用一把尺：每天的条一样宽、左边对齐（有角标「+1」的第 1 天也一样）
  const tracks = await region.locator(".phone-track").evaluateAll((nodes) =>
    nodes.map((node) => {
      const box = node.getBoundingClientRect();
      return [Math.round(box.left), Math.round(box.width)];
    }),
  );
  expect(new Set(tracks.map((t) => t.join(","))).size).toBe(1);

  // 展开那天：每条字前面那个点，正对着自己那块的左边沿（你提的：点的最左和块的最左是垂直的）
  const open = days.first();
  const pairs = await open.locator(".phone-tag:not([data-flipped])").evaluateAll((tags) =>
    tags.map((tag) => {
      const block = document.querySelector<HTMLElement>(`[data-segment][data-block-id="${tag.getAttribute("data-block-id")}"]`)!;
      return { name: tag.textContent, dot: tag.getBoundingClientRect().left, block: block.getBoundingClientRect().left };
    }),
  );
  expect(pairs.length).toBeGreaterThan(0);
  for (const pair of pairs) expect(Math.abs(pair.dot - pair.block), `「${pair.name}」的点对准它的块`).toBeLessThanOrEqual(0.5);

  // 字不互相压、不出屏幕，行数不超过 3
  const boxes = await open.locator(".phone-tag").evaluateAll((tags) =>
    tags.map((tag) => {
      const box = tag.getBoundingClientRect();
      return { l: box.left, r: box.right, t: Math.round(box.top) };
    }),
  );
  for (const [i, a] of boxes.entries()) {
    expect(a.r, "字没出屏幕").toBeLessThanOrEqual(360);
    for (const b of boxes.slice(i + 1)) {
      const sameRow = a.t === b.t;
      expect(sameRow && a.l < b.r && b.l < a.r, "同一行的字不压在一起").toBe(false);
    }
  }
  expect(new Set(boxes.map((b) => b.t)).size).toBeLessThanOrEqual(3);
  await expect(open).toContainText("排了 12.3 小时 · 还有 1 件没排时间");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await shot(page, "01-phone-timeline");

  // 点第 2 天：它展开，第 1 天收起
  await days.nth(1).getByRole("button", { name: /^第 2 天/ }).click();
  await expect(days.nth(1)).toHaveAttribute("data-open", "true");
  await expect(days.first()).not.toHaveAttribute("data-open", "true");

  // 点色块：选中，屏幕底部浮出快捷条
  await region.getByRole("button", { name: /^苏州园林 / }).click();
  await expect(page.getByRole("toolbar", { name: "「苏州园林」的操作" })).toBeVisible();
  await shot(page, "02-selected", { screen: true });

  // 没展开的第 3 天：点它的色块是展开这天，不选中
  await region.getByRole("button", { name: /^寒山寺 / }).click();
  await expect(days.nth(2)).toHaveAttribute("data-open", "true");
  await expect(page.getByRole("toolbar", { name: "「寒山寺」的操作" })).toHaveCount(0);

  // 条上写：关掉「时长」只写名字，再关掉「标题」一个字都不写
  const textParts = page.getByRole("group", { name: "条上写" });
  await expect(days.nth(2).locator(".phone-tag")).toHaveText(["寒山寺 2 小时"]);
  await textParts.getByRole("button", { name: "时长" }).click();
  await expect(days.nth(2).locator(".phone-tag")).toHaveText(["寒山寺"]);
  await textParts.getByRole("button", { name: "标题" }).click();
  await expect(days.nth(2).locator(".phone-tag")).toHaveCount(0);

  expect(errors).toEqual([]);
});
