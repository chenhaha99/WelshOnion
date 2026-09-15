import type { CapacitorConfig } from "@capacitor/cli";

/** 手机 app（Capacitor）：网页按 app 的方式构建到 dist-app（见 vite.config.ts），打包进安卓工程 android/ */
const config: CapacitorConfig = {
  appId: "io.github.chenhaha99.welshonion",
  appName: "葱葱",
  webDir: "dist-app",
};

export default config;
