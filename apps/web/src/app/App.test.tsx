// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import { initLibraryDoc } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { openLibrary } from "../storage/library";
import { LIBRARY_DB } from "../storage/names";
import { createPlan, deletePlan } from "../storage/plans";
import { releaseAll, storeDoc, track } from "../storage/test-helpers";
import { renderApp } from "./test-render";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

async function storePlan(name: string): Promise<string> {
  const library = await openLibrary();
  const plan = await createPlan(library.doc, { name, now: "2026-09-01T08:00:00.000Z" });
  await plan.close();
  await library.close();
  return plan.planId;
}

describe("本机数据版本太新", () => {
  it("说明原因，不显示列表", async () => {
    await storeDoc(LIBRARY_DB, (doc) => {
      initLibraryDoc(doc);
      doc.getMap("meta").set("schema", 5);
    });

    renderApp("#/");
    expect(await screen.findByText(/本机数据是更新版本的葱葱存的/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /新建/ })).toBeNull();
  });
});

describe("计划页外壳", () => {
  it("刷新后还在这个计划", async () => {
    const planId = await storePlan("关西 10 天");

    renderApp(`#/plans/${planId}`);
    expect(await screen.findByRole("heading", { name: "关西 10 天" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /我的计划/ })).toBeTruthy();
  });

  it("找不到计划", async () => {
    renderApp("#/plans/nope");
    expect(await screen.findByText("找不到这个计划")).toBeTruthy();
    expect(screen.getByRole("link", { name: /我的计划/ })).toBeTruthy();
  });

  it("别的标签页删掉了开着的计划", async () => {
    const planId = await storePlan("关西 10 天");
    renderApp(`#/plans/${planId}`);
    await screen.findByRole("heading", { name: "关西 10 天" });

    const otherTab = track(await openLibrary());
    await deletePlan(otherTab.doc, planId);
    expect(await screen.findByText("这个计划已经删除了")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "关西 10 天" })).toBeNull();
    expect(screen.getByRole("link", { name: /我的计划/ })).toBeTruthy();
  });
});
