import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // 离线安装：构建时生成清单和 service worker，把页面文件预先缓存下来。
    // 注册脚本只注册、不刷新页面：新版本装好就接管，开着的页面继续用旧脚本，下次打开才是新版本。开发模式不启用。
    VitePWA({
      injectRegister: "script-defer",
      registerType: "autoUpdate",
      includeAssets: ["favicon-16.png", "favicon-32.png", "apple-touch-icon.png"],
      manifest: {
        name: "葱葱",
        short_name: "葱葱",
        lang: "zh-CN",
        start_url: "/",
        display: "standalone",
        background_color: "#f6f4ef",
        theme_color: "#6f9a82",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png}"],
      },
    }),
  ],
});
