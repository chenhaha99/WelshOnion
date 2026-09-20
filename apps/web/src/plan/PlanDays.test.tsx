// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDayInTz, readLibrary, readPlan, setDays } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { NOW, renderApp } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { createPlan, openPlan } from "../storage/plans";
import { releaseAll, track } from "../storage/test-helpers";
import { openPlanSettings, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

async function storePlan(setup?: (doc: Y.Doc) => void): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name: "测试计划", now: NOW });
  setup?.(plan.doc);
  await plan.close();
  await library.close();
  return plan.planId;
}

async function openStoredPlan(setup?: (doc: Y.Doc) => void): Promise<void> {
  renderApp(`#/plans/${await storePlan(setup)}`);
}

function threeDaysFromOct1(doc: Y.Doc): string[] {
  const result = setDays(doc, { startDate: "2026-10-01", count: 3, tz: "Asia/Shanghai" });
  if (!result.ok) throw new Error("建天失败");
  return result.value.baseIds;
}

async function dayLabels(): Promise<string[]> {
  await showView("日程");
  const list = await screen.findByRole("list", { name: "每天" });
  return within(list)
    .getAllByRole("listitem")
    .map((row) => row.querySelector("[data-day-label]")?.textContent ?? "");
}

describe("还没有天时只问几天", () => {
  it("定下天数", async () => {
    const user = userEvent.setup();
    await openStoredPlan();

    fireEvent.change(await screen.findByLabelText("出发日期"), { target: { value: "2026-10-01" } });
    await user.type(screen.getByLabelText("天数"), "3");
    await user.click(screen.getByRole("button", { name: "确定" }));

    expect(await dayLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五", "第 3 天 · 10.3 周六"]);
  });

  it("出发日期默认今天", async () => {
    await openStoredPlan();
    const start = (await screen.findByLabelText("出发日期")) as HTMLInputElement;
    expect(start.value).toBe("2026-09-14");
  });

  it("系统时区报成 Etc/GMT-8：按北京建天", async () => {
    const user = userEvent.setup();
    const planId = await storePlan();
    renderApp(`#/plans/${planId}`, { timeZone: "Etc/GMT-8" });

    fireEvent.change(await screen.findByLabelText("出发日期"), { target: { value: "2026-10-01" } });
    await user.type(screen.getByLabelText("天数"), "1");
    await user.click(screen.getByRole("button", { name: "确定" }));
    await dayLabels();

    const otherTab = track(await openLibrary());
    const stored = track(await openPlan(otherTab.doc, planId, NOW));
    expect(readPlan(stored.doc, readLibrary(otherTab.doc)).bases.map((base) => base.tz)).toEqual(["Asia/Shanghai"]);
  });
});

describe("每天的列表", () => {
  it("全程一个时区：没有城市名和小时差", async () => {
    await openStoredPlan(threeDaysFromOct1);
    expect(await dayLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五", "第 3 天 · 10.3 周六"]);
  });

  it("出境当天加了东京", async () => {
    await openStoredPlan((doc) => {
      const result = setDays(doc, { startDate: "2026-10-01", count: 2, tz: "Asia/Shanghai" });
      if (!result.ok) throw new Error("建天失败");
      addDayInTz(doc, result.value.baseIds[1]!, "Asia/Tokyo");
    });
    expect(await dayLabels()).toEqual([
      "第 1 天 · 10.1 周四 · 北京",
      "第 2 天 · 10.2 周五 · 北京",
      "第 2 天 · 10.2 周五 · 东京 +1h",
    ]);
  });
});

describe("整趟改出发日期", () => {
  it("推迟一周（出发日期在计划设置里）", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeDaysFromOct1);
    await dayLabels();

    const settings = await openPlanSettings(user);
    fireEvent.change(within(settings).getByLabelText("出发日期"), { target: { value: "2026-10-08" } });
    await waitFor(async () =>
      expect(await dayLabels()).toEqual(["第 1 天 · 10.8 周四", "第 2 天 · 10.9 周五", "第 3 天 · 10.10 周六"]),
    );
  });
});
