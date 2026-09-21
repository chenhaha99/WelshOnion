import { expect, test, type Page } from "@playwright/test";
import { showView } from "./timeline-helpers";

// 这份走查跑在构建版上（见 playwright.config.ts 的 built 项目）

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

/** 离线缓存装好、接管了这个网址。没装上时最多等 10 秒就判失败。 */
async function waitForOfflineCache(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state ?? "none"), {
      timeout: 10_000,
    })
    .toBe("activated");
}

/** 在页面里读一张图：宽、高，四个角的透明度（0 是全透明，255 是不透明）。 */
async function imageInfo(page: Page, url: string): Promise<{ size: string; cornerAlpha: number[] }> {
  return page.evaluate(async (src) => {
    const image = new Image();
    image.src = src;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const right = canvas.width - 1;
    const bottom = canvas.height - 1;
    const corners = [
      [0, 0],
      [right, 0],
      [0, bottom],
      [right, bottom],
    ];
    return {
      size: `${image.naturalWidth}x${image.naturalHeight}`,
      cornerAlpha: corners.map(([x, y]) => context.getImageData(x!, y!, 1, 1).data[3]!),
    };
  }, url);
}

test("清单和图标", async ({ page }) => {
  await page.goto("/");
  const link = page.locator('link[rel="manifest"]');
  await expect(link).toHaveCount(1);
  const href = await link.getAttribute("href");
  expect(href).not.toBeNull();

  const manifestResponse = await page.request.get(new URL(href!, page.url()).toString());
  expect(manifestResponse.ok()).toBe(true);
  const manifest = (await manifestResponse.json()) as { name: string; display: string; start_url: string; icons: ManifestIcon[] };
  expect(manifest).toMatchObject({ name: "葱葱", display: "standalone", start_url: "/" });
  expect(manifest.icons).toEqual([
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, page.url()).toString();
    expect((await page.request.get(url)).ok(), `${icon.src} 取得到`).toBe(true);
    expect((await imageInfo(page, url)).size, `${icon.src} 的大小`).toBe(icon.sizes);
  }
  // 192、512 是 logo 原图缩小：圆角外面透明，装到电脑桌面上看到的是 logo 本身的圆角方形
  for (const src of ["icon-192.png", "icon-512.png"]) {
    const info = await imageInfo(page, new URL(src, page.url()).toString());
    expect(info.cornerAlpha, `${src} 四角透明`).toEqual([0, 0, 0, 0]);
  }
  // 手机系统裁 maskable 时四周要有东西，不能是透明的
  const maskable = await imageInfo(page, new URL("icon-maskable-512.png", page.url()).toString());
  expect(maskable.cornerAlpha, "maskable 四角不透明").toEqual([255, 255, 255, 255]);
});

test("网页小图标和苹果桌面图标", async ({ page }) => {
  await page.goto("/");
  const icons = await page
    .locator('link[rel="icon"]')
    .evaluateAll((links) =>
      links.map((link) => ({ href: (link as HTMLLinkElement).href, sizes: link.getAttribute("sizes"), type: link.getAttribute("type") })),
    );
  expect(icons.map(({ sizes, type }) => ({ sizes, type }))).toEqual([
    { sizes: "32x32", type: "image/png" },
    { sizes: "16x16", type: "image/png" },
  ]);
  for (const icon of icons) {
    expect((await imageInfo(page, icon.href)).size, `${icon.href} 的大小`).toBe(icon.sizes);
  }

  // 苹果主屏不认透明，透明的地方会填成黑色：四角要不透明
  const apple = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect(apple).not.toBeNull();
  const appleInfo = await imageInfo(page, new URL(apple!, page.url()).toString());
  expect(appleInfo.size).toBe("180x180");
  expect(appleInfo.cornerAlpha, "苹果桌面图标四角不透明").toEqual([255, 255, 255, 255]);
});

test("断网刷新：列表和计划页照常，能加一件事", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto("/");
  await page.getByRole("button", { name: "新建第一个计划" }).click();
  await page.getByRole("textbox", { name: "计划名" }).fill("关西 10 天");
  await page.keyboard.press("Enter");
  await page.getByLabel("出发日期").fill("2026-10-01");
  await page.getByLabel("天数").fill("3");
  await page.getByRole("button", { name: "确定" }).click();
  // 打开是时间线：这份走查从安排表开始，先切到日程
  await showView(page, "日程");
  const days = page.getByRole("list", { name: "每天" }).getByRole("listitem");
  await expect(days).toHaveCount(3);
  await page.getByRole("link", { name: /我的计划/ }).click();
  const card = page.getByRole("heading", { level: 3, name: "关西 10 天" });
  await expect(card).toBeVisible();

  // 离线缓存装好再断网、刷新
  await waitForOfflineCache(page);
  await context.setOffline(true);
  await page.reload();

  await expect(card).toBeVisible();
  await card.click();
  await expect(days).toHaveCount(3);
  const table = page.getByRole("table", { name: /10\.1/ });
  await table.getByRole("textbox", { name: "加一件事" }).fill("西湖");
  await page.keyboard.press("Enter");
  await expect(table.locator("tr[data-block-id]")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("offline-plan.png"), fullPage: true });

  await context.setOffline(false);
  expect(errors).toEqual([]);
});

test("开发模式不启用离线缓存", async ({ page }) => {
  await page.goto("http://localhost:5199/");
  await expect(page.getByRole("button", { name: "新建第一个计划" })).toBeVisible();
  expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
});
