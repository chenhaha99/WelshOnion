import { expect, test, type Page } from "@playwright/test";
import { DAY1, DAY2, addBlocks, addMoney, keepUndated, newPlan, pickKind, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 10.1 西湖（游玩 ¥300）和午饭（餐饮，叠了半小时）、灵隐寺没排时间 2 小时；10.2 乌镇（游玩 ¥450）。 */
async function trip(page: Page, width: number, height: number): Promise<void> {
  await newPlan(page, 3, { width, height });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖", "午饭", "灵隐寺"]);
  await pickKind(page, day1, "午饭", "餐饮");
  await schedule(page, day1, "西湖", "09:00", "3");
  await schedule(page, day1, "午饭", "11:30", "1");
  await keepUndated(page, day1, "灵隐寺", undefined, "2");
  await addMoney(page, day1, "西湖", "300");
  const day2 = page.getByRole("table", { name: DAY2 });
  await addBlocks(page, day2, ["乌镇"]);
  await schedule(page, day2, "乌镇", "09:00", "8");
  await addMoney(page, day2, "乌镇", "450");
}

/** 环是个圈，正中间是空的：按角度算出环上的一个点（半径取环的中线），把鼠标移过去。 */
async function hoverArc(page: Page, fraction: number): Promise<void> {
  const box = (await page.locator("[data-kind-ring]").boundingBox())!;
  const scale = box.width / 340;
  const angle = fraction * Math.PI * 2 - Math.PI / 2;
  await page.mouse.move(box.x + (170 + Math.cos(angle) * 124) * scale, box.y + (170 + Math.sin(angle) * 124) * scale);
}

/**
 * 等环上的胀缩动画停下来：换维度时每段是慢慢胀缩过去的，没等它停就去点环、去截图，
 * 描边还没长到那个位置，打不中、也照不对。
 * 要读**算出来的样式**——属性是一下子就改好的，动画中的真实长度只在计算样式里；
 * 连着两次读到一样才算停，省得为每一段猜一个阈值。
 */
async function ringSettled(page: Page): Promise<void> {
  let last = "";
  await expect
    .poll(
      async () => {
        const now = await page
          .locator("circle.ring-arc")
          .evaluateAll((nodes) => nodes.map((node) => Math.round(Number.parseFloat(getComputedStyle(node).strokeDasharray))).join(","));
        const same = now === last;
        last = now;
        return same;
      },
      { intervals: [120, 120, 120, 120, 120, 120, 120, 120] },
    )
    .toBe(true);
}

test("电脑上：一个环 → 拨圆心的开关换维度 → 停在一类上环和那行一起亮 → 点一类看明细 → 只看这一类 → 点一条跳过去", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 1280, 800);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });
  const kindRows = card.getByRole("list", { name: "按类型" });

  // 圆心：开销是大字，时间缩成一行淡字，两个都看得到
  await expect(card.locator("[data-ring-big]")).toHaveText("¥750");
  await expect(card.locator("[data-ring-money]")).toHaveText("¥750");
  await expect(card).toContainText("人均 ¥750");
  // 西湖 3 小时和午饭 1 小时叠了半小时，两件层一样高、各算各的；加上乌镇 8 小时
  await expect(card.locator("[data-ring-time]")).toHaveText("12 小时");
  await expect(card).toContainText("还有 2 小时没排");
  // 环画开销：只有游玩花了钱，一段；开销没有「还没排」那个概念
  await expect(card.locator("[data-ring-seg]")).toHaveCount(1);
  await expect(card.locator("[data-ring-rest]")).toHaveCount(0);
  // 每类一行，开销和时间两格都在，不用拨开关就能左右比
  await expect(kindRows.locator("[data-row-name]")).toHaveText(["游玩", "餐饮"]);
  await expect(kindRows.locator("[data-row-money]")).toHaveText(["¥750 · 100%", "没填"]);
  await expect(kindRows.locator("[data-row-time]")).toHaveText(["11 小时 · 92%", "1 小时 · 8%"]);
  await shot(page, "01-ring");

  // 拨到时间：大字换成时长、钱缩成淡字；环改画时间，末尾多一段「还没排」
  const ringSwitch = card.getByRole("group", { name: "环上画开销还是时间" });
  await ringSwitch.getByRole("button", { name: "时间" }).click();
  await expect(card.locator("[data-ring-big]")).toHaveText("12 小时");
  await expect(card.locator("[data-ring-money]")).toHaveText("¥750");
  await expect(card.locator("[data-ring-seg]")).toHaveCount(2); // 游玩、餐饮
  await expect(card.locator("[data-ring-rest]")).toHaveCount(1);
  // 每类那几行不跟着重排，也不跟着少一格
  await expect(kindRows.locator("[data-row-name]")).toHaveText(["游玩", "餐饮"]);
  await expect(kindRows.locator("[data-row-money]")).toHaveText(["¥750 · 100%", "没填"]);
  // 等胀缩停下来再截图：走查图是拿来当文档看的，截在动画中间会以为画错了
  await ringSettled(page);
  await shot(page, "02-time");

  // 拨回开销，停在环上的「游玩」那一段：圆心换成这一类
  await ringSwitch.getByRole("button", { name: "开销" }).click();
  await ringSettled(page);
  await hoverArc(page, 0.25);
  await expect(card.locator("[data-ring-money]")).toHaveText("¥750");
  // 两行：这一维度的占比，再一行淡字写另一个维度
  await expect(card.locator("[data-ring-detail]")).toHaveText("占开销 100%11 小时 · 占时间 92%");
  await shot(page, "03-hover", { screen: true });

  // 点那一行展开这一类：开销和事各一列
  await card.getByRole("button", { name: /^游玩 / }).click();
  const opened = page.getByRole("region", { name: "游玩的明细" });
  await expect(opened.getByRole("listitem")).toHaveText([
    "没写说明 ¥300 · 10.1 西湖",
    "没写说明 ¥450 · 10.2 乌镇",
    "西湖 10.1 09:00 · 3 小时",
    "乌镇 10.2 09:00 · 8 小时",
  ]);
  await shot(page, "03-opened");

  // 只看这一类：筛选那一排按下「游玩」
  await opened.getByRole("button", { name: "只看这一类" }).click();
  const kinds = page.getByRole("group", { name: "按类型筛选" });
  await expect(kinds.getByRole("button", { name: "游玩", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(kindRows.locator("[data-row-name]")).toHaveText(["游玩"]);
  await kinds.getByRole("button", { name: "全部类型" }).click();

  // 点明细里的一条：跳到时间线上的那件事
  await expect(opened).toBeVisible();
  await opened.getByRole("button", { name: /^乌镇/ }).click();
  await expect(page.getByRole("group", { name: "视图" }).getByRole("button", { name: "时间线" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("toolbar", { name: "「乌镇」的操作" })).toBeVisible();

  expect(errors).toEqual([]);
});

test("手机上：环占满宽度，每类那一行不出屏幕，点一类照样看得到", async ({ page }) => {
  const errors = watchErrors(page);
  await trip(page, 390, 844);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });

  const box = (await card.boundingBox())!;
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);

  await card.getByRole("button", { name: /^游玩 / }).click();
  await expect(page.getByRole("region", { name: "游玩的明细" }).getByRole("listitem")).toHaveCount(4);
  await shot(page, "04-mobile");

  expect(errors).toEqual([]);
});

test("切角和刻度：浅色底上的那点未来感确实画出来了", async ({ page }) => {
  await trip(page, 1280, 800);
  await showView(page, "总览");
  const card = page.getByRole("region", { name: "总览" });

  // 四角的切角：卡片四角各一个，有边框色
  const corners = card.locator(".corner-bracket");
  await expect(corners).toHaveCount(4);
  const border = await corners.first().evaluate((node) => getComputedStyle(node).borderTopColor);
  expect(border).not.toBe("rgba(0, 0, 0, 0)");

  // 环外一圈刻度
  await expect(card.locator(".ring-tick")).toHaveCount(40);

  // 圆心的开关钉住不动：鼠标停到某一类上、圆心换成明细时，它的位置一像素都不能挪，不然点不着
  const ringSwitch = card.getByRole("group", { name: "环上画开销还是时间" });
  const before = (await ringSwitch.boundingBox())!;
  await card.getByRole("button", { name: /^游玩 / }).hover();
  await expect(card.locator("[data-ring-detail]")).toBeVisible();
  const during = (await ringSwitch.boundingBox())!;
  expect(during.x).toBeCloseTo(before.x, 0);
  expect(during.y).toBeCloseTo(before.y, 0);
  // 还点得着
  await ringSwitch.getByRole("button", { name: "时间" }).click();
  await expect(card.locator("[data-ring-big]")).toHaveText("12 小时");
});
