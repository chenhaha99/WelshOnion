// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { afterAll, describe, expect, it } from "vitest";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const outDirs: string[] = [];

/** 用真的 vite.config.ts 按某个模式构建到临时目录，返回输出目录。 */
async function buildWith(mode: string): Promise<string> {
  const outDir = mkdtempSync(join(tmpdir(), `welshonion-${mode}-`));
  outDirs.push(outDir);
  await build({ root: ROOT, configFile: join(ROOT, "vite.config.ts"), mode, logLevel: "silent", build: { outDir, emptyOutDir: true } });
  return outDir;
}

afterAll(() => {
  for (const dir of outDirs) rmSync(dir, { recursive: true, force: true });
});

describe("按 app 的方式构建网页", () => {
  it("app 方式没有离线缓存和网页清单；浏览器版照旧有", async () => {
    const app = await buildWith("app");
    expect(existsSync(join(app, "sw.js"))).toBe(false);
    expect(existsSync(join(app, "manifest.webmanifest"))).toBe(false);
    const appHtml = readFileSync(join(app, "index.html"), "utf8");
    expect(appHtml).not.toContain("registerSW");
    expect(appHtml).not.toContain('rel="manifest"');

    const web = await buildWith("production");
    expect(existsSync(join(web, "sw.js"))).toBe(true);
    expect(readFileSync(join(web, "index.html"), "utf8")).toContain("registerSW");
  }, 180_000);
});
