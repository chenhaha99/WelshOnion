import { test, type Page } from "@playwright/test";

/** 收集页面报错和控制台错误，走查最后断言它是空的。 */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

/**
 * 截图，存进这份走查的输出目录。平时截整页。
 * 截之前先等两帧：整页截图时浏览器会临时把窗口高度报成 1、按整页重新排版，这时候跑的帧量到的都是假尺寸。
 * 刚滚过页面（比如 focus() 把按钮滚进屏幕）时，弹层要在下一帧检查按钮是否滚出了屏幕；
 * 这一帧要是正好落在截图里，就会量到假尺寸，把开着的弹层关掉。先把排着的帧跑完，再截。
 *
 * 鼠标按着拖的时候传 dragging，只截当前屏幕：整页截图有时还会让窗口失焦，
 * 拖拽在失焦时放弃（用户切走窗口本来就该放弃），接着松手就什么都不落。
 */
export async function shot(page: Page, name: string, { dragging = false }: { dragging?: boolean } = {}): Promise<void> {
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await page.screenshot({ path: test.info().outputPath(`${name}.png`), fullPage: !dragging });
}
