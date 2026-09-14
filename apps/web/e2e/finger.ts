import type { CDPSession, Page } from "@playwright/test";
import type { Point } from "./timeline-helpers";

// 走查里模拟手指：Playwright 自己只有点一下（tap），没有按住、挪、抬起，所以用 Chromium 的 CDP 触摸输入。
// 页面要开 hasTouch；坐标是屏幕上的 CSS 像素。

/** 长按要按住多久才生效（毫秒）：应用里是 0.5 秒，多等一点 */
const LONG_PRESS_WAIT_MS = 700;

const sessions = new WeakMap<Page, CDPSession>();

async function sessionOf(page: Page): Promise<CDPSession> {
  let session = sessions.get(page);
  if (!session) {
    session = await page.context().newCDPSession(page);
    sessions.set(page, session);
  }
  return session;
}

export async function fingerDown(page: Page, at: Point): Promise<void> {
  await (await sessionOf(page)).send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [at] });
}

/** 手指从 from 挪到 to，分几步。 */
export async function fingerMove(page: Page, from: Point, to: Point, steps = 8): Promise<void> {
  const session = await sessionOf(page);
  for (let step = 1; step <= steps; step++) {
    const point = { x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps };
    await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [point] });
  }
}

export async function fingerUp(page: Page): Promise<void> {
  await (await sessionOf(page)).send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

/** 浏览器取消了这次触摸（来电、系统手势）：不会有抬起，也不会补发点击。 */
export async function fingerCancel(page: Page): Promise<void> {
  await (await sessionOf(page)).send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
}

/** 按下马上抬起。 */
export async function fingerTap(page: Page, at: Point): Promise<void> {
  await fingerDown(page, at);
  await fingerUp(page);
}

/** 按住不动，等长按生效；不抬起。 */
export async function longPress(page: Page, at: Point): Promise<void> {
  await fingerDown(page, at);
  await page.waitForTimeout(LONG_PRESS_WAIT_MS);
}
