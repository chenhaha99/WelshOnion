// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, exportPlan, parsePlanFile, setDays } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan, deletePlan, storedPlanIds } from "../storage/plans";
import { showView } from "../plan/test-helpers";
import { releaseAll } from "../storage/test-helpers";

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

const EXPORTED = "2026-09-15T08:00:00.000Z";

/** 本机存一个计划：10.1 起 3 天，10.1 上有「西湖」；顺便把它导出成文件的内容。 */
async function storePlan(name = "关西 10 天"): Promise<{ planId: string; fileText: string }> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name, now: EXPORTED });
  const days = setDays(plan.doc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  addBlock(plan.doc, library.doc, { baseId: days.value.baseIds[0]!, kindId: "sight", title: "西湖", minute: 540, duration: 120 });
  const fileText = exportPlan(library.doc, plan.doc, EXPORTED);
  await plan.close();
  await library.close();
  return { planId: plan.planId, fileText };
}

async function cardNames(): Promise<string[]> {
  const headings = await screen.findAllByRole("heading", { level: 2 });
  return headings.map((heading) => heading.textContent ?? "");
}

async function openSettings(user: User): Promise<HTMLElement> {
  await user.click(await screen.findByRole("button", { name: "设置" }));
  return screen.getByRole("dialog", { name: "设置" });
}

/** 拦下下载：记下建出来的文件和点下去的链接的文件名。 */
function captureDownloads() {
  const blobs: Blob[] = [];
  const fileNames: Array<string | null> = [];
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    writable: true,
    value: (blob: Blob) => {
      blobs.push(blob);
      return `blob:test/${blobs.length}`;
    },
  });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, writable: true, value: () => {} });
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    fileNames.push(this.getAttribute("download"));
  });
  return { blobs, fileNames };
}

async function chooseFile(user: User, panel: HTMLElement, content: string, name = "plan.welshonion.json") {
  await user.upload(within(panel).getByLabelText("选择计划文件"), new File([content], name, { type: "application/json" }));
}

describe("设置按钮和面板", () => {
  it("有计划时：「设置」在「我的计划」那一行；面板里有导出、导入，列着计划；列表上不直接摆导出导入", async () => {
    const user = userEvent.setup();
    await storePlan();
    renderApp("#/");

    const header = (await screen.findByRole("heading", { name: "我的计划", level: 1 })).closest("header")!;
    expect(within(header).getByRole("button", { name: "设置" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /导出/ })).toBeNull();
    expect(screen.queryByLabelText("选择计划文件")).toBeNull();

    const panel = await openSettings(user);
    expect(within(panel).getByRole("heading", { name: "导出计划" })).toBeTruthy();
    expect(within(panel).getByRole("heading", { name: "导入计划" })).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "导出「关西 10 天」" })).toBeTruthy();
  });

  it("一个计划都没有时也有「设置」，导出那一块写着还没有计划", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await screen.findByRole("button", { name: "新建第一个计划" });

    const panel = await openSettings(user);

    expect(within(panel).getByText("还没有计划")).toBeTruthy();
  });

  it("按 Esc 关掉，焦点回到「设置」", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    await openSettings(user);

    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "设置" })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "设置" }));
  });
});

describe("导出一个计划", () => {
  it("下载「计划名.welshonion.json」，内容是这个计划；面板里写已导出", async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await user.click(within(panel).getByRole("button", { name: "导出「关西 10 天」" }));

    await waitFor(() => expect(downloads.fileNames).toEqual(["关西 10 天.welshonion.json"]));
    const parsed = parsePlanFile(await downloads.blobs[0]!.text());
    expect(parsed.ok && parsed.value.name).toBe("关西 10 天");
    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("已导出「关西 10 天」"));
  });

  it("名字里文件名不能用的字符换成下划线", async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    await storePlan("杭州/苏州");
    renderApp("#/");
    const panel = await openSettings(user);

    await user.click(within(panel).getByRole("button", { name: "导出「杭州/苏州」" }));

    await waitFor(() => expect(downloads.fileNames).toEqual(["杭州_苏州.welshonion.json"]));
  });
});

describe("导入一个计划", () => {
  it("本机没有这个计划：原样导入，进入这个计划；回到列表只有它", async () => {
    const user = userEvent.setup();
    const { planId, fileText } = await storePlan();
    const library = await openLibrary();
    await deletePlan(library.doc, planId);
    await library.close();
    renderApp("#/");
    await screen.findByRole("button", { name: "新建第一个计划" });

    await chooseFile(user, await openSettings(user), fileText);

    expect(await screen.findByRole("button", { name: "关西 10 天" })).toBeTruthy();
    await showView("日程");
    expect(await screen.findByDisplayValue("西湖")).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    expect(await cardNames()).toEqual(["关西 10 天"]);
    expect(await storedPlanIds()).toEqual([planId]);
  });

  it("本机已经有：另存一份「（导入）」，进入新的这份，原来那份还在、内容没变", async () => {
    const user = userEvent.setup();
    const { planId, fileText } = await storePlan();
    renderApp("#/");

    await chooseFile(user, await openSettings(user), fileText);

    expect(await screen.findByRole("button", { name: "关西 10 天（导入）" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    await waitFor(async () => expect((await cardNames()).sort()).toEqual(["关西 10 天", "关西 10 天（导入）"].sort()));
    const ids = await storedPlanIds();
    expect(ids).toHaveLength(2);
    expect(ids).toContain(planId);
    await user.click(screen.getByRole("link", { name: /^关西 10 天(?!（导入）)/ }));
    expect(await screen.findByRole("button", { name: "关西 10 天" })).toBeTruthy();
    await showView("日程");
    expect(await screen.findByDisplayValue("西湖")).toBeTruthy();
  });
});

describe("导入不了的文件", () => {
  it("不是计划文件：写明原因，面板还开着，本机的计划没变", async () => {
    const user = userEvent.setup();
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await chooseFile(user, panel, "hello", "hello.json");

    expect((await within(panel).findByRole("alert")).textContent).toBe("这个文件不是葱葱导出的计划，没有导入");
    expect(screen.getByRole("dialog", { name: "设置" })).toBe(panel);
    expect(await storedPlanIds()).toHaveLength(1);
  });

  it("来自更新的版本", async () => {
    const user = userEvent.setup();
    const { fileText } = await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await chooseFile(user, panel, JSON.stringify({ ...JSON.parse(fileText), version: 5 }));

    expect((await within(panel).findByRole("alert")).textContent).toBe(
      "这个文件来自更新版本的葱葱，这里还读不了，没有导入",
    );
  });

  it("关掉面板再打开，上一次的提示都不见了", async () => {
    const user = userEvent.setup();
    const downloads = captureDownloads();
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);
    await user.click(within(panel).getByRole("button", { name: "导出「关西 10 天」" }));
    await waitFor(() => expect(downloads.fileNames).toHaveLength(1));
    await chooseFile(user, panel, "hello", "hello.json");
    await within(panel).findByRole("alert");

    await user.keyboard("{Escape}");
    const reopened = await openSettings(user);

    expect(within(reopened).queryByRole("alert")).toBeNull();
    expect(within(reopened).getByRole("status").textContent).toBe("");
  });
});
