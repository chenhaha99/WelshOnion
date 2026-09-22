import { expect, test, type Page } from "@playwright/test";
import { bigPlanFile } from "./big-plan";

// 大计划也不卡：20 天、200 件事、100 笔开销。跑在构建版上（见 playwright.config.ts 的 built 项目），开发版的 React 慢很多、量不准。
// 「画完」= 从点下去（按下去）到下一帧画出来：在页面里记事件的时刻，下一帧的 requestAnimationFrame 里再排一个任务，它跑的时候这一帧已经画完。

const file = bigPlanFile();

type View = "时间线" | "日程" | "总览";

/** 在页面上点「视图」里的一个按钮，等那个视图画出来、下一帧画完，返回用了多少毫秒。 */
async function switchView(page: Page, name: View, rows: number): Promise<number> {
  return page.evaluate(
    ([name, rows]) =>
      new Promise<number>((resolve) => {
        const button = [...document.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="视图"] button')].find(
          (item) => item.textContent === name,
        )!;
        // 画出来了：日程是每件事一行都在；时间线、总览是它们那一块出来、日程的行都没了
        const shown = () =>
          name === "日程"
            ? document.querySelectorAll("tr[data-block-id]").length === rows
            : document.querySelector(name === "时间线" ? 'section[aria-label="时间线"]' : '[aria-label="总览"]') !== null &&
              document.querySelectorAll("tr[data-block-id]").length === 0;
        const start = performance.now();
        button.click();
        const wait = () => {
          if (!shown()) {
            requestAnimationFrame(wait);
            return;
          }
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)));
        };
        wait();
      }),
    [name, rows] as const,
  );
}

/** 做一个动作（按键、点按钮），量从事件发生到下一帧画完。 */
async function timed(page: Page, type: "keydown" | "click", act: () => Promise<void>): Promise<number> {
  await page.evaluate((type) => {
    const record = window as unknown as { __timed?: Promise<number> };
    record.__timed = new Promise((resolve) => {
      window.addEventListener(
        type,
        (event) => {
          const start = event.timeStamp;
          requestAnimationFrame(() => setTimeout(() => resolve(performance.now() - start)));
        },
        { capture: true, once: true },
      );
    });
  }, type);
  await act();
  return page.evaluate(() => (window as unknown as { __timed: Promise<number> }).__timed);
}

const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

/** 日程里标题是 text 的那个输入框排第几（按输入框里现在的字找）；没有是 -1。 */
function titleIndex(page: Page, text: string): Promise<number> {
  return page
    .locator("input[aria-label='标题']")
    .evaluateAll((inputs, text) => inputs.findIndex((input) => (input as HTMLInputElement).value === text), text);
}

test("大计划：切视图 300 毫秒内画完，日程里回车改标题、撤销 100 毫秒内画完", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog", { name: "设置", exact: true })
    .getByLabel("选择计划文件")
    .setInputFiles({ name: "大计划.welshonion.json", mimeType: "application/json", buffer: Buffer.from(file.text) });
  await expect(page.getByRole("heading", { level: 1, name: file.name })).toBeVisible();
  await expect(page.locator('section[aria-label="时间线"]')).toBeVisible();

  // 先来回切一趟热身（头一次要加载代码），再各量 3 次取中位数
  const rows = file.blockCount;
  await switchView(page, "日程", rows);
  await switchView(page, "时间线", rows);
  const toSchedule: number[] = [];
  const toTimeline: number[] = [];
  const toOverview: number[] = [];
  for (let i = 0; i < 3; i++) {
    toSchedule.push(await switchView(page, "日程", rows));
    toTimeline.push(await switchView(page, "时间线", rows));
    toOverview.push(await switchView(page, "总览", rows));
    await switchView(page, "时间线", rows);
  }
  console.log(`切到日程 ${toSchedule.map(Math.round)}，切回时间线 ${toTimeline.map(Math.round)}，切到总览 ${toOverview.map(Math.round)} 毫秒`);
  expect(median(toSchedule), "切到日程").toBeLessThanOrEqual(300);
  expect(median(toTimeline), "切回时间线").toBeLessThanOrEqual(300);
  expect(median(toOverview), "切到总览").toBeLessThanOrEqual(300);

  // 日程里把第 1 天「早饭 1」改成「早饭」，回车；再点页顶的「撤销」（焦点还在输入框里，Ctrl+Z 撤的是框里的字）
  await switchView(page, "日程", rows);
  await page.locator("input[aria-label='标题']").nth(await titleIndex(page, "早饭 1")).fill("早饭");
  const commit = await timed(page, "keydown", () => page.keyboard.press("Enter"));
  await expect.poll(() => titleIndex(page, "早饭")).toBeGreaterThanOrEqual(0);
  const undo = await timed(page, "click", () => page.getByRole("button", { name: "撤销", exact: true }).click());
  await expect.poll(() => titleIndex(page, "早饭 1")).toBeGreaterThanOrEqual(0);
  console.log(`回车改标题 ${Math.round(commit)}，撤销 ${Math.round(undo)} 毫秒`);
  expect(commit, "回车改标题").toBeLessThanOrEqual(100);
  expect(undo, "撤销").toBeLessThanOrEqual(100);
});

test("大计划：手机上（CPU 降速 4 倍，模拟中档手机）切到日程 300 毫秒内画完", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page
    .getByRole("dialog", { name: "设置", exact: true })
    .getByLabel("选择计划文件")
    .setInputFiles({ name: "大计划.welshonion.json", mimeType: "application/json", buffer: Buffer.from(file.text) });
  await expect(page.getByRole("heading", { level: 1, name: file.name })).toBeVisible();
  await expect(page.locator('section[aria-label="时间线"]')).toBeVisible();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  const rows = file.blockCount;
  await switchView(page, "日程", rows);
  await switchView(page, "时间线", rows);
  const toSchedule: number[] = [];
  for (let i = 0; i < 3; i++) {
    toSchedule.push(await switchView(page, "日程", rows));
    await switchView(page, "时间线", rows);
  }
  console.log(`手机：切到日程 ${toSchedule.map(Math.round)} 毫秒`);
  expect(median(toSchedule), "手机切到日程").toBeLessThanOrEqual(300);
  await context.close();
});
