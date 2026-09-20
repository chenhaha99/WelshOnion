import { expect, test, type Locator, type Page } from "@playwright/test";
import { DAY1, DAY2, DAY3, addBlocks, newPlan, pickKind, rowOf, schedule } from "./timeline-helpers";
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

test("电脑上的时刻表：左边开始时刻、竖线串起来、空档写一行 → 点空档加一件事 → 点圆圈完成 → 住进民宿前空着的晚上", async ({ page }) => {
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
  const circle = (await drive.getByRole("button", { name: /^标记：/ }).boundingBox())!;
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

  // 点「午饭」的圆圈：完成，整张卡片换成浅灰底、四周一圈虚线，标题划一道
  const lunch = await rowOf(table, "午饭");
  await lunch.getByRole("button", { name: /^标记：/ }).click();
  await expect(lunch).toHaveAttribute("data-mark", "done");
  await expect(lunch.getByRole("button", { name: /^标记：/ })).toHaveAttribute("aria-label", "标记：完成");
  const cardLooks = (node: Element) => {
    const style = getComputedStyle(node);
    return { left: style.borderLeftStyle, top: style.borderTopStyle, background: style.backgroundColor };
  };
  const done = await lunch.locator(".schedule-card").evaluate(cardLooks);
  const plain = await drive.locator(".schedule-card").evaluate(cardLooks);
  expect(done.left, "完成用实线").toBe("solid");
  expect(done.top, "四周一圈也是实线").toBe("solid");
  expect(done.background, "底色和没完成的不一样").not.toBe(plain.background);
  await page.mouse.click(5, 5);
  expect(
    await lunch.getByRole("textbox", { name: "标题" }).evaluate((node) => getComputedStyle(node).textDecorationLine),
  ).toBe("line-through");
  await shot(page, "02-desktop-added-done");

  expect(errors).toEqual([]);
});

async function edges(locator: Locator): Promise<{ top: number; bottom: number }> {
  const found = (await locator.boundingBox())!;
  return { top: found.y, bottom: found.y + found.height };
}

/** 这天的组头（「第 1 天」、日期、「这天的操作」）。 */
function dayHead(page: Page, table: Locator): Locator {
  return page.getByRole("list", { name: "每天" }).locator(":scope > li", { has: table }).locator("[data-day-side]");
}

/** 离页顶那一行下边多远（组头停住时是十几像素）。 */
async function belowBar(page: Page, locator: Locator): Promise<number> {
  return (await edges(locator)).top - (await edges(page.locator("[data-top-bar]"))).bottom;
}

test("日程往下滚：「第几天」停在页顶那一行下面，滚完这天跟着走（电脑、手机）", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3, { width: 1280, height: 800 });
  const day1 = page.getByRole("table", { name: DAY1 });
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day1, ["一", "二", "三", "四", "五", "六", "七", "八"]);
  await addBlocks(page, day2, ["九", "十", "十一", "十二"]);
  await addBlocks(page, page.getByRole("table", { name: DAY3 }), ["十三", "十四", "十五", "十六"]);
  await page.mouse.move(640, 600);

  // 电脑上：滚到 10.1 的第 6 件在屏幕上边，左边「第 1 天」停在页顶那一行下面
  await (await rowOf(day1, "六")).evaluate((row) => row.scrollIntoView({ block: "start" }));
  const label1 = dayHead(page, day1).locator("[data-day-label]");
  expect(await belowBar(page, label1), "「第 1 天」离页顶那一行").toBeGreaterThanOrEqual(0);
  expect(await belowBar(page, label1), "「第 1 天」离页顶那一行").toBeLessThanOrEqual(24);
  await expect(label1).toContainText("第 1 天");
  await shot(page, "03-desktop-day-stays", { screen: true });

  // 滚到 10.2：「第 1 天」跟着 10.1 滚走，「第 2 天」停住
  await day2.evaluate((table) => table.scrollIntoView({ block: "start" }));
  expect((await edges(label1)).bottom, "「第 1 天」滚走了").toBeLessThanOrEqual((await edges(page.locator("[data-top-bar]"))).bottom + 1);
  const label2 = dayHead(page, day2).locator("[data-day-label]");
  expect(await belowBar(page, label2), "「第 2 天」离页顶那一行").toBeGreaterThanOrEqual(0);
  expect(await belowBar(page, label2), "「第 2 天」离页顶那一行").toBeLessThanOrEqual(24);

  // 手机上：组头是一条白底圆角的条，停在页顶那一行下面、盖在时刻表上面
  await page.setViewportSize({ width: 390, height: 844 });
  await page.mouse.move(195, 600);
  await (await rowOf(day1, "六")).evaluate((row) => row.scrollIntoView({ block: "start" }));
  const head1 = dayHead(page, day1);
  expect(await belowBar(page, head1), "「第 1 天」那一条离页顶那一行").toBeGreaterThanOrEqual(0);
  expect(await belowBar(page, head1), "「第 1 天」那一条离页顶那一行").toBeLessThanOrEqual(24);
  await expect(head1, "那一条有底色").not.toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await shot(page, "04-phone-day-stays", { screen: true });

  expect(errors).toEqual([]);
});

/**
 * 跨天的事在日程卡片上写「20:00–10.2 06:10」，比平常的「20:00–22:00」长一大截。
 * 手机上字一大（安卓的 WebView 跟着系统字号走，中文又落到比电脑宽的兜底字体），
 * 它就会顶到后面的时长上——真机上出现过，压成一团。
 *
 * 这里把整页的字按倍数放大来模拟，比真机更严苛：真机只放大文字，这里连留白也一起放大了。
 * 最窄只测到 360（在产安卓机的最小宽度）配 1.3 倍（安卓最大的字号档）；
 * 更窄的 320 配 1.3 倍还是会压到「⋯」上，没管——那比任何在产手机都窄。
 */
for (const { width, zoom } of [
  { width: 390, zoom: 1 },
  { width: 360, zoom: 1.15 },
  { width: 360, zoom: 1.3 },
]) {
  test(`窄屏 ${width}、字放大 ${zoom} 倍：跨天的时间和时长不挤在一起`, async ({ page }) => {
    await newPlan(page, 1, { width, height: 844 });
    const table = page.getByRole("table", { name: DAY1 });
    await addBlocks(page, table, ["夜车"]);
    await schedule(page, table, "夜车", "20:00", "10", "10");
    // 学安卓：整页的字按系统字号放大
    await page.addStyleTag({ content: `html { font-size: ${16 * zoom}px }` });

    const time = (await page.locator("[data-block-time]").first().boundingBox())!;
    const duration = (await page.locator("[data-block-duration]").first().boundingBox())!;
    const card = (await page.locator(".schedule-card").first().boundingBox())!;
    expect(await page.locator("[data-block-time]").first().innerText()).toContain("06:10");
    // 挤不下时时长会换到第二行，那不算压在一起——所以比的是两块地方有没有相交，不是谁在谁左边
    const side = (a: number, b: number, c: number, d: number) => Math.max(0, Math.min(a + b, c + d) - Math.max(a, c));
    const overlap =
      side(time.x, time.width, duration.x, duration.width) * side(time.y, time.height, duration.y, duration.height);
    expect(overlap, "时间和时长压在一起了").toBe(0);
    // 也不能压到右上角那个「⋯」上
    const menu = (await page.locator("button[aria-label='这件事的操作']").first().boundingBox())!;
    const onMenu = side(time.x, time.width, menu.x, menu.width) * side(time.y, time.height, menu.y, menu.height);
    expect(onMenu, "时间压到「这件事的操作」上了").toBe(0);
    expect(duration.x + duration.width, "时长越出卡片了").toBeLessThanOrEqual(card.x + card.width + 0.5);
    expect(time.x + time.width, "时间越出卡片了").toBeLessThanOrEqual(card.x + card.width + 0.5);
  });
}
