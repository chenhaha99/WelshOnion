// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const RES = fileURLToPath(new URL("../../android/app/src/main/res/", import.meta.url));

/** [密度, 老图标边长, 自适应图标每层边长]，像素 */
const DENSITIES = [
  ["mdpi", 48, 108],
  ["hdpi", 72, 162],
  ["xhdpi", 96, 216],
  ["xxhdpi", 144, 324],
  ["xxxhdpi", 192, 432],
] as const;

/** 米白：第一版外观的底色 */
const CREAM = "#F6F4EF";

/** PNG 文件头里的宽高：「宽x高」 */
function pngSize(file: string): string {
  const bytes = readFileSync(file);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("app 图标", () => {
  it("自适应图标引用前景图和背景图", () => {
    for (const name of ["ic_launcher", "ic_launcher_round"]) {
      const xml = readFileSync(`${RES}mipmap-anydpi-v26/${name}.xml`, "utf8");
      expect(xml, name).toContain('android:drawable="@mipmap/ic_launcher_foreground"');
      expect(xml, name).toContain('android:drawable="@mipmap/ic_launcher_background"');
    }
  });

  it("各密度的宽高", () => {
    for (const [density, legacy, layer] of DENSITIES) {
      expect(pngSize(`${RES}mipmap-${density}/ic_launcher_foreground.png`), density).toBe(`${layer}x${layer}`);
      expect(pngSize(`${RES}mipmap-${density}/ic_launcher_background.png`), density).toBe(`${layer}x${layer}`);
      expect(pngSize(`${RES}mipmap-${density}/ic_launcher.png`), density).toBe(`${legacy}x${legacy}`);
      expect(pngSize(`${RES}mipmap-${density}/ic_launcher_round.png`), density).toBe(`${legacy}x${legacy}`);
    }
  });
});

describe("启动画面", () => {
  it("米白底，没有 Capacitor 自带的启动图", () => {
    const splashFiles = readdirSync(RES)
      .filter((dir) => dir.startsWith("drawable"))
      .flatMap((dir) =>
        readdirSync(`${RES}${dir}`)
          .filter((name) => name.startsWith("splash."))
          .map((name) => `${dir}/${name}`),
      );
    expect(splashFiles).toEqual(["drawable/splash.xml"]);
    expect(readFileSync(`${RES}drawable/splash.xml`, "utf8")).toContain(CREAM);
    expect(readFileSync(`${RES}values/styles.xml`, "utf8")).toContain(`<item name="windowSplashScreenBackground">${CREAM}</item>`);
  });
});
