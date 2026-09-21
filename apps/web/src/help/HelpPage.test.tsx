// @vitest-environment happy-dom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { renderApp } from "../app/test-render";
import { releaseAll } from "../storage/test-helpers";
import { markUsed, readUsed } from "./help-usage";

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await releaseAll();
});

describe("「怎么用」页（照 Things、Procreate 按场景分组）", () => {
  it("按场景分五组，每条写手势和它做什么", async () => {
    renderApp("#/help");

    expect(await screen.findByRole("heading", { name: "怎么用", level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent)).toEqual([
      "手机上的时间线",
      "电脑上的时间线",
      "日程",
      "首页",
      "键盘快捷键",
    ]);
    const phone = screen.getByRole("region", { name: "手机上的时间线" });
    expect(within(phone).getByText("两根手指张开、合拢")).toBeTruthy();
  });

  it("用过的那条打勾（照 Figma 快捷键面板高亮用过的）", async () => {
    markUsed("pinch");
    renderApp("#/help");

    const phone = await screen.findByRole("region", { name: "手机上的时间线" });
    const pinch = within(phone).getByText("两根手指张开、合拢").closest("li")!;
    expect(within(pinch).getByText("用过了")).toBeTruthy();
    const longPress = within(phone).getByText("按住色块半秒").closest("li")!;
    expect(within(longPress).queryByText("用过了")).toBeNull();
  });

  it("能再拿一份示例计划（照 Things 从帮助里再建教程项目）", async () => {
    renderApp("#/help");
    expect(await screen.findByRole("button", { name: "再拿一份示例计划" })).toBeTruthy();
  });

  it("首页的「设置」里有「怎么用」；电脑上在首页按 ? 直接打开", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await user.click(await screen.findByRole("button", { name: "设置" }));
    expect(screen.getByRole("link", { name: "怎么用" }).getAttribute("href")).toBe("#/help");
    await user.keyboard("{Escape}");

    await user.keyboard("?");
    expect(await screen.findByRole("heading", { name: "怎么用", level: 1 })).toBeTruthy();
  });
});

describe("本机记着用过哪些手势", () => {
  it("记一次就一直在；认不出的存档当没用过", () => {
    expect(readUsed().has("alt-copy")).toBe(false);
    markUsed("alt-copy");
    markUsed("alt-copy");
    expect([...readUsed()]).toEqual(["alt-copy"]);
    localStorage.setItem("welshonion.help-used", "{坏的");
    expect(readUsed().size).toBe(0);
  });
});
