// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setPlanSettings, updateBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function driveBlock(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, meters: number): void {
  const result = addBlock(plan, library, { baseId, kindId: "transit", title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  updateBlock(plan, library, result.value.blockId, { transport_mode: "drive", distance_m: meters });
}

/** 10.1：「去湖州」自驾 132 公里、「去乌镇」自驾 30 公里，都没挂钱（每公里成本还空着，所以没自动挂油费）。 */
function twoDrives(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  driveBlock(plan, library, oct1!, "去湖州", 132000);
  driveBlock(plan, library, oct1!, "去乌镇", 30000);
}

async function openSettings(user: User): Promise<HTMLElement> {
  await user.click(await screen.findByRole("button", { name: "测试计划" }));
  return screen.getByRole("dialog", { name: "计划设置" });
}

async function cellOf(title: string): Promise<string | null> {
  return (await blockRow("10.1", title)).querySelector("[data-money-cell]")?.textContent ?? null;
}

async function setCostAndBackfill(user: User): Promise<HTMLElement> {
  const settings = await openSettings(user);
  await user.type(within(settings).getByLabelText("每公里成本（元）"), "0.8{Enter}");
  const prompt = within(settings).getByRole("group", { name: "补油费" });
  expect(within(prompt).getByText("给已有的 2 个自驾块补上油费吗？")).toBeTruthy();
  await user.click(within(prompt).getByRole("button", { name: "补上" }));
  return settings;
}

describe("事后设每公里成本时问要不要补油费", () => {
  it("补上：两块都挂上油费，问句消失", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoDrives);

    const settings = await setCostAndBackfill(user);
    expect(within(settings).queryByRole("group", { name: "补油费" })).toBeNull();
    await waitFor(async () => expect(await cellOf("去湖州")).toBe("¥105.60"));
    expect(await cellOf("去乌镇")).toBe("¥24");
  });

  it("撤销是一步：两笔油费都没了，每公里成本还在", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(twoDrives);
    const other = await openOtherTab(planId);

    await setCostAndBackfill(user);
    await waitFor(async () => expect(await cellOf("去乌镇")).toBe("¥24"));
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(async () => expect(await cellOf("去湖州")).toBe("填钱"));
    expect(await cellOf("去乌镇")).toBe("填钱");
    await waitFor(() => expect(other.plan().plan.cost_per_km_cents).toBe(80));
  });

  it("不用：问句消失，什么都不改", async () => {
    const user = userEvent.setup();
    await openStoredPlan(twoDrives);

    const settings = await openSettings(user);
    await user.type(within(settings).getByLabelText("每公里成本（元）"), "0.8{Enter}");
    await user.click(within(within(settings).getByRole("group", { name: "补油费" })).getByRole("button", { name: "不用" }));
    expect(within(settings).queryByRole("group", { name: "补油费" })).toBeNull();
    expect(await cellOf("去湖州")).toBe("填钱");
    expect(await cellOf("去乌镇")).toBe("填钱");
  });

  it("改成别的值不问", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      driveBlock(plan, library, oct1!, "去湖州", 132000);
      setPlanSettings(plan, { cost_per_km_cents: 80 });
    });

    const settings = await openSettings(user);
    const cost = within(settings).getByLabelText("每公里成本（元）");
    await user.clear(cost);
    await user.type(cost, "1{Enter}");
    expect(within(settings).queryByRole("group", { name: "补油费" })).toBeNull();
  });

  it("没有要补的块不问", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => {
      daysFromOct1(plan, 1);
    });

    const settings = await openSettings(user);
    await user.type(within(settings).getByLabelText("每公里成本（元）"), "0.8{Enter}");
    expect(within(settings).queryByRole("group", { name: "补油费" })).toBeNull();
  });
});
