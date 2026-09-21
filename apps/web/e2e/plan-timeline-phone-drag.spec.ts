import { expect, test, type Page } from "@playwright/test";
import { fingerDown, fingerMove, fingerTap, fingerUp, longPress } from "./finger";
import { addBlocks, box, center, DAY1, DAY2, newPlan, schedule, segment, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

// 手机上拖（照 iMovie：长按到块浮起再拖、选中后拖两端把手；照 Final Cut Pro：吸到别的事的边、拖到别的轨道、拖到边上自己滚）
test.use({ hasTouch: true });

/** 「现在」固定在出发（10.1）之前：打开时展开第 1 天 */
const BEFORE_TRIP = new Date("2026-09-20T02:00:00Z");

/** 两天：第 1 天早饭 07:00–08:40、西湖 10:00–13:00；第 2 天拙政园 10:00–12:00 */
async function trip(page: Page): Promise<void> {
  await page.clock.setFixedTime(BEFORE_TRIP);
  await newPlan(page, 2, { width: 390, height: 844 });
  const d1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, d1, ["早饭", "西湖"]);
  await schedule(page, d1, "早饭", "07:00", "1", "40");
  await schedule(page, d1, "西湖", "10:00", "3");
  const d2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, d2, ["拙政园"]);
  await schedule(page, d2, "拙政园", "10:00", "2");
  await showView(page, "时间线");
}

function days(page: Page) {
  return page.getByRole("region", { name: "时间线" }).getByRole("list", { name: "每天" }).getByRole("listitem");
}

/** 两根手指从 a、b 同时挪到 a2、b2（捏合） */
async function pinch(page: Page, a: Point, b: Point, a2: Point, b2: Point): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [a, b] });
  for (let step = 1; step <= 8; step++) {
    const at = (from: Point, to: Point) => ({ x: from.x + ((to.x - from.x) * step) / 8, y: from.y + ((to.y - from.y) * step) / 8 });
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [at(a, a2), at(b, b2)] });
  }
  await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

type Point = { x: number; y: number };

test("长按拿起：左右改时间、靠近前一件的结束吸上去，手指上方写时间；拖到第 2 天换天", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page);
  const [first, second] = [days(page).nth(0), days(page).nth(1)];

  // 西湖的左沿挪到早饭右沿右边 3 像素：不吸是 08:45，吸上是 08:40
  const lake = await box(segment(first, "西湖"));
  const breakfast = await box(segment(first, "早饭"));
  const grab = { x: lake.x + 6, y: lake.y + lake.height / 2 };
  await longPress(page, grab);
  await expect(page.locator("[data-lifted]")).toHaveCount(1);
  const to = { x: grab.x + (breakfast.x + breakfast.width + 3 - lake.x), y: grab.y };
  await fingerMove(page, grab, to);
  await expect(page.locator("[data-drag-label]")).toContainText("08:40");
  await shot(page, "01-phone-drag", { screen: true });
  await fingerUp(page);
  await expect(first.getByRole("button", { name: /^西湖 08:40–11:40/ })).toBeVisible();

  // 往下拖到第 2 天那一行：换天，时间不变
  const moved = center(await box(segment(first, "西湖")));
  await longPress(page, moved);
  await expect(page.locator("[data-lifted]")).toHaveCount(1);
  const target = center(await second.locator(".phone-track").boundingBox().then((b) => b!));
  await fingerMove(page, moved, { x: moved.x, y: target.y });
  await fingerUp(page);
  await expect(second.getByRole("button", { name: /^西湖 08:40–11:40/ })).toBeVisible();

  expect(errors).toEqual([]);
});

test("没展开的天长按不拿起来；轻点照旧展开", async ({ page }) => {
  await trip(page);
  const second = days(page).nth(1);
  const garden = center(await box(segment(second, "拙政园")));
  await longPress(page, garden);
  await fingerMove(page, garden, { x: garden.x + 40, y: garden.y });
  await expect(page.locator("[data-lifted]")).toHaveCount(0);
  await fingerUp(page);
  await expect(second.getByRole("button", { name: /^拙政园 10:00–12:00/ })).toBeVisible();
});

test("选中后两端有把手：按住右把手直接拖长（不用长按），靠近后一件的开始吸上去", async ({ page }) => {
  await trip(page);
  const first = days(page).nth(0);
  // 早饭选中：右把手拖到西湖左沿左边 3 像素，结束吸到 10:00
  await fingerTap(page, center(await box(segment(first, "早饭"))));
  const handle = page.locator('[data-handle="end"]');
  await expect(handle).toHaveCount(1);
  const grip = center((await handle.boundingBox())!);
  const breakfast = await box(segment(first, "早饭"));
  const lake = await box(segment(first, "西湖"));
  // 把手在块外面：按的是把手中间，拖的距离让早饭的右沿落到西湖左沿左边 3 像素
  await fingerDown(page, grip);
  await fingerMove(page, grip, { x: grip.x + (lake.x - 3 - (breakfast.x + breakfast.width)), y: grip.y });
  await fingerUp(page);
  await expect(first.getByRole("button", { name: /^早饭 07:00–10:00/ })).toBeVisible();
});

test("双指捏合放大整条时间线，所有天一起；「看全部」回到一屏；放大后拖到右边，时间线自己往右滚", async ({ page }) => {
  await trip(page);
  const scroller = page.locator("[data-phone-scroll]");
  const rect = (await scroller.boundingBox())!;
  const mid = { x: rect.x + rect.width / 2, y: rect.y + 20 };
  await pinch(page, { x: mid.x - 20, y: mid.y }, { x: mid.x + 20, y: mid.y }, { x: mid.x - 80, y: mid.y }, { x: mid.x + 80, y: mid.y });
  expect(Number(await scroller.getAttribute("data-zoom"))).toBeGreaterThan(2);
  // 所有天的条一样宽，比一屏宽
  const widths = await page.locator(".phone-track").evaluateAll((tracks) => tracks.map((t) => Math.round(t.getBoundingClientRect().width)));
  expect(new Set(widths).size).toBe(1);
  expect(widths[0]!).toBeGreaterThan(rect.width);
  await shot(page, "02-phone-zoomed", { screen: true });

  // 放大后拖西湖到屏幕右边：外面那层自己往右滚
  const first = days(page).nth(0);
  // 西湖滚到看得见的左边一点，右边还有地方可滚
  await segment(first, "西湖").evaluate((node) => node.scrollIntoView({ inline: "center", block: "nearest" }));
  const lake = center((await segment(first, "西湖").boundingBox())!);
  const before = await scroller.evaluate((node) => node.scrollLeft);
  await longPress(page, lake);
  await fingerMove(page, lake, { x: rect.x + rect.width - 4, y: lake.y });
  await page.waitForTimeout(400);
  expect(await scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(before);
  await fingerUp(page);

  await page.getByRole("button", { name: "看全部" }).click();
  await expect(scroller).toHaveAttribute("data-zoom", "1");
});

test("放大着看上午时加一件事：落在屏幕外的钟点，时间线自己滚过去让它露出来", async ({ page }) => {
  await trip(page);
  const scroller = page.locator("[data-phone-scroll]");
  const rect = (await scroller.boundingBox())!;
  const mid = { x: rect.x + rect.width / 2, y: rect.y + 20 };
  await pinch(page, { x: mid.x - 20, y: mid.y }, { x: mid.x + 20, y: mid.y }, { x: mid.x - 80, y: mid.y }, { x: mid.x + 80, y: mid.y });
  await scroller.evaluate((node) => (node.scrollLeft = 0));

  // 第 1 天最后一件西湖 13:00 结束：新加的排在 13:00–14:00，放大着从最左边看是在屏幕外
  await page.getByRole("region", { name: "时间线" }).getByRole("textbox", { name: "加一件事" }).fill("午饭");
  await page.keyboard.press("Enter");
  const lunch = days(page).nth(0).getByRole("button", { name: /^午饭 13:00–14:00/ });
  await expect(lunch).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await lunch.boundingBox())!;
      return box.x >= rect.x && box.x + box.width <= rect.x + rect.width;
    })
    .toBe(true);
});
