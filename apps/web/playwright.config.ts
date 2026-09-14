import { defineConfig, devices } from "@playwright/test";

// 真浏览器走查：起开发服务器，用 Playwright 自带的 Chromium 把关键流程走一遍并截图
export default defineConfig({
  testDir: "e2e",
  workers: 1,
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://localhost:5199",
  },
  webServer: {
    command: "pnpm exec vite --port 5199 --strictPort",
    url: "http://localhost:5199",
    reuseExistingServer: false,
  },
});
