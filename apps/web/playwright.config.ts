import { defineConfig, devices } from "@playwright/test";

const browser = {
  ...devices["Desktop Chrome"],
  // 固定时区和语言，截图和断言不随跑的机器变
  timezoneId: "Asia/Shanghai",
  locale: "zh-CN",
};

// 真浏览器走查：起开发服务器，用 Playwright 自带的 Chromium 把关键流程走一遍并截图。
// 离线安装要验构建出来的版本（开发模式不启用离线缓存），另起一个先构建再预览的服务，只跑那一份走查。
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  projects: [
    { name: "dev", testIgnore: /offline-install\.spec\.ts/, use: { ...browser, baseURL: "http://localhost:5199" } },
    { name: "built", testMatch: /offline-install\.spec\.ts/, use: { ...browser, baseURL: "http://localhost:5200" } },
  ],
  webServer: [
    {
      command: "pnpm exec vite --port 5199 --strictPort",
      url: "http://localhost:5199",
      reuseExistingServer: false,
    },
    {
      command: "pnpm exec vite build && pnpm exec vite preview --port 5200 --strictPort",
      url: "http://localhost:5200",
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
