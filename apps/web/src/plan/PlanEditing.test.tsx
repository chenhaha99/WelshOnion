// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { dayLabels, daysFromOct1, openDayMenu, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

async function openSettings(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "测试计划" }));
  return screen.getByRole("dialog", { name: "计划设置" });
}

describe("撤销和重做", () => {
  it("撤销插天再重做", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "在下面插一天" }));
    await waitFor(async () => expect(await dayLabels()).toHaveLength(3));

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await dayLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.2 周五"]));

    await user.keyboard("{Control>}{Shift>}z{/Shift}{/Control}");
    await waitFor(async () => expect(await dayLabels()).toHaveLength(3));
  });

  it("新打开时撤销、重做都不可点", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 2));
    await dayLabels();

    expect(screen.getByRole("button", { name: "撤销" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: "重做" }).hasAttribute("disabled")).toBe(true);
  });
});

describe("列表卡片跟着改", () => {
  it("回到列表卡片是新的", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    const settings = await openSettings(user);
    const travelers = within(settings).getByLabelText("人数");
    await user.clear(travelers);
    await user.type(travelers, "3{Enter}");
    await user.click(within(settings).getByRole("button", { name: "关闭" }));
    await user.click(screen.getByRole("link", { name: /我的计划/ }));

    expect(await screen.findByText("10.1 – 10.3 · 3 天 · 3 人")).toBeTruthy();
  });
});

describe("计划设置抽屉", () => {
  it("改名字：标题和列表卡片都变", async () => {
    const user = userEvent.setup();
    await openStoredPlan();

    const settings = await openSettings(user);
    const name = within(settings).getByLabelText("名字");
    await user.clear(name);
    await user.type(name, "关西 10 天{Enter}");
    await user.click(within(settings).getByRole("button", { name: "关闭" }));

    expect(await screen.findByRole("heading", { level: 1, name: "关西 10 天" })).toBeTruthy();
    await user.click(screen.getByRole("link", { name: /我的计划/ }));
    expect(await screen.findByRole("heading", { level: 2, name: "关西 10 天" })).toBeTruthy();
  });

  it("改每公里成本：按元填，存成分", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan();
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    await user.type(within(settings).getByLabelText("每公里成本（元）"), "0.8{Enter}");
    await waitFor(() => expect(other.plan().plan.cost_per_km_cents).toBe(80));

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog", { name: "计划设置" })).toBeNull();
    const reopened = await openSettings(user);
    expect((within(reopened).getByLabelText("每公里成本（元）") as HTMLInputElement).value).toBe("0.8");
  });

  it("人数填错：不保存，栏下说明", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan();
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    const travelers = within(settings).getByLabelText("人数");
    await user.clear(travelers);
    await user.type(travelers, "0{Enter}");

    expect(within(settings).getByText("人数要是正整数")).toBeTruthy();
    expect(other.plan().plan.traveler_count).toBe(1);
  });
});
