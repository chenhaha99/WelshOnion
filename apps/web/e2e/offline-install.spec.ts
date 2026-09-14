import { expect, test, type Page } from "@playwright/test";

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
  expect(manifest.icons).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ sizes: "192x192", type: "image/png" }),
      expect.objectContaining({ sizes: "512x512", type: "image/png" }),
      expect.objectContaining({ purpose: "maskable" }),
    ]),
  );
  for (const icon of manifest.icons) {
    expect((await page.request.get(new URL(icon.src, page.url()).toString())).ok()).toBe(true);
  }
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
  const days = page.getByRole("list", { name: "日期列表" }).getByRole("listitem");
  await expect(days).toHaveCount(3);
  await page.getByRole("link", { name: /我的计划/ }).click();
  const card = page.getByRole("heading", { level: 2, name: "关西 10 天" });
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
