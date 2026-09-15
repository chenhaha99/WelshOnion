// @vitest-environment happy-dom
import { Directory, Encoding } from "@capacitor/filesystem";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, parsePlanFile, setDays } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan } from "../storage/plans";
import { releaseAll } from "../storage/test-helpers";

interface WriteFileOptions {
  path: string;
  data: string;
  directory: string;
  encoding: string;
}

// 这个文件里的测试都当作在 app 里跑：Capacitor 说是原生平台，写文件、分享换成假的
const native = vi.hoisted(() => ({
  writeFile: vi.fn(async (options: WriteFileOptions) => ({ uri: `file:///cache/${options.path}` })),
  share: vi.fn(async (_options: { title?: string; files?: string[] }) => ({})),
}));
vi.mock("@capacitor/core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@capacitor/core")>();
  return { ...original, Capacitor: { ...original.Capacitor, isNativePlatform: () => true } };
});
vi.mock("@capacitor/filesystem", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@capacitor/filesystem")>()),
  Filesystem: { writeFile: native.writeFile },
}));
vi.mock("@capacitor/share", () => ({ Share: { share: native.share } }));

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  native.writeFile.mockClear();
  native.share.mockClear();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

/** 本机存一个计划：10.1 起 3 天，10.1 上有「西湖」。 */
async function storePlan(name = "关西 10 天"): Promise<void> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name, now: "2026-09-15T08:00:00.000Z" });
  const days = setDays(plan.doc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
  if (!days.ok) throw new Error("建天失败");
  addBlock(plan.doc, library.doc, { baseId: days.value.baseIds[0]!, kindId: "sight", title: "西湖", minute: 540, duration: 120 });
  await plan.close();
  await library.close();
}

async function openSettings(user: User): Promise<HTMLElement> {
  await user.click(await screen.findByRole("button", { name: "设置" }));
  return screen.getByRole("dialog", { name: "设置" });
}

describe("在 app 里导出计划", () => {
  it("写进缓存目录、弹出系统分享这个文件；分享完写已导出，不走下载", async () => {
    const user = userEvent.setup();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await user.click(within(panel).getByRole("button", { name: "导出「关西 10 天」" }));

    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("已导出「关西 10 天」"));
    expect(native.writeFile).toHaveBeenCalledTimes(1);
    const options = native.writeFile.mock.calls[0]![0];
    expect(options).toMatchObject({ path: "关西 10 天.welshonion.json", directory: Directory.Cache, encoding: Encoding.UTF8 });
    const parsed = parsePlanFile(options.data);
    expect(parsed.ok && parsed.value.name).toBe("关西 10 天");
    expect(native.share).toHaveBeenCalledWith(expect.objectContaining({ files: ["file:///cache/关西 10 天.welshonion.json"] }));
    expect(click).not.toHaveBeenCalled();
  });

  it("取消分享：不写已导出", async () => {
    const user = userEvent.setup();
    native.share.mockRejectedValueOnce(new Error("Share canceled"));
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await user.click(within(panel).getByRole("button", { name: "导出「关西 10 天」" }));

    await waitFor(() => expect(native.share).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(panel).getByRole("status").textContent).toBe("");
  });

  it("写文件出错：写导出失败，不弹分享", async () => {
    const user = userEvent.setup();
    native.writeFile.mockRejectedValueOnce(new Error("disk full"));
    await storePlan();
    renderApp("#/");
    const panel = await openSettings(user);

    await user.click(within(panel).getByRole("button", { name: "导出「关西 10 天」" }));

    await waitFor(() => expect(within(panel).getByRole("status").textContent).toBe("导出失败"));
    expect(native.share).not.toHaveBeenCalled();
  });
});

describe("在 app 里导入计划", () => {
  it("选文件不限类型", async () => {
    const user = userEvent.setup();
    renderApp("#/");
    const panel = await openSettings(user);

    expect(within(panel).getByLabelText("选择计划文件").hasAttribute("accept")).toBe(false);
  });
});
