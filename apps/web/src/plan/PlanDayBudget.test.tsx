// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setDayBudget, setPlanSettings } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { dayRow, daysFromOct1, openDayMenu, openOtherTab, openPlanSettings, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, minute: number, duration: number): void {
  const result = addBlock(plan, library, { baseId, kindId: "sight", title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
}

async function openSettings(user: User): Promise<HTMLElement> {
  // 设置分了块：时间预算在「时间预算」那一块里
  return openPlanSettings(user, "时间预算");
}

async function openDayBudget(user: User, day: string): Promise<HTMLElement> {
  await user.click(within(await openDayMenu(user, day)).getByRole("menuitem", { name: "这天的时间预算…" }));
  return within(await dayRow(day)).getByRole("group", { name: /的时间预算$/ });
}

function field(container: HTMLElement, label: string): HTMLInputElement {
  return within(container).getByLabelText(label) as HTMLInputElement;
}

async function budgetLineOf(day: string): Promise<string | null> {
  return (await dayRow(day)).querySelector("[data-day-budget]")?.textContent ?? null;
}

async function menuButtonOf(day: string): Promise<HTMLElement> {
  return within(await dayRow(day)).getByRole("button", { name: "这天的操作" });
}

describe("设置里设每天默认的时间预算", () => {
  it("设默认：四栏存成预算，每天马上看到；再打开设置显示同样的字", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    await user.type(field(settings, "几点起"), "8:00{Enter}");
    await user.type(field(settings, "几点收工"), "22:00{Enter}");
    await user.type(field(settings, "最多开多久（小时）"), "4.5{Enter}");
    await user.type(field(settings, "最多开多远（公里）"), "300{Enter}");

    await waitFor(() =>
      expect(other.plan().plan.default_day_budget).toEqual({
        start: "08:00",
        end: "22:00",
        max_drive_min: 270,
        max_drive_km: 300,
      }),
    );
    expect(await budgetLineOf("10.1")).toBe("你设的：08:00 起 · 22:00 收工 · 最多开 4.5 小时 · 最多开 300 公里");

    await user.click(within(settings).getByRole("button", { name: "关闭" }));
    const again = await openSettings(user);
    expect(
      ["几点起", "几点收工", "最多开多久（小时）", "最多开多远（公里）"].map((label) => field(again, label).value),
    ).toEqual(["08:00", "22:00", "4.5", "300"]);
  });

  it("清空一栏；四栏都空了就不存预算", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => {
      daysFromOct1(plan, 1);
      setPlanSettings(plan, { default_day_budget: { start: "08:00", end: "22:00" } });
    });
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    await user.clear(field(settings, "几点收工"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(other.plan().plan.default_day_budget).toEqual({ start: "08:00" }));

    await user.clear(field(settings, "几点起"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(other.plan().plan.default_day_budget).toBeNull());
  });

  it("时刻填错：栏下说明，不保存", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    await user.type(field(settings, "几点起"), "25:00{Enter}");
    expect(await within(settings).findByText("要填 00:00 到 23:59 之间的时刻")).toBeTruthy();
    expect(other.plan().plan.default_day_budget).toBeNull();
  });

  it("公里数填小数：栏下说明，不保存", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => daysFromOct1(plan, 1));
    const other = await openOtherTab(planId);

    const settings = await openSettings(user);
    await user.type(field(settings, "最多开多远（公里）"), "2.5{Enter}");
    expect(await within(settings).findByText("要填不小于 0 的整数")).toBeTruthy();
    expect(other.plan().plan.default_day_budget).toBeNull();
  });
});

describe("这天单独设时间预算", () => {
  it("只改这天的一项；淡字写计划的默认，计划没设的写「不设」", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => {
      daysFromOct1(plan, 2);
      setPlanSettings(plan, { default_day_budget: { start: "08:00", end: "22:00" } });
    });
    const other = await openOtherTab(planId);

    const editor = await openDayBudget(user, "10.2");
    expect(
      ["几点起", "几点收工", "最多开多久（小时）", "最多开多远（公里）"].map((label) => field(editor, label).placeholder),
    ).toEqual(["08:00", "22:00", "不设", "不设"]);

    await user.type(field(editor, "最多开多远（公里）"), "300{Enter}");
    await waitFor(() => expect(other.plan().bases[1]!.day_budget).toEqual({ max_drive_km: 300 }));
    expect(other.plan().bases[0]!.day_budget).toBeNull();
  });

  it("清空就跟计划", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan) => {
      const [, oct2] = daysFromOct1(plan, 2);
      setDayBudget(plan, oct2!, { start: "07:00" });
    });
    const other = await openOtherTab(planId);

    const editor = await openDayBudget(user, "10.2");
    expect(field(editor, "几点起").value).toBe("07:00");
    await user.clear(field(editor, "几点起"));
    await user.keyboard("{Enter}");
    await waitFor(() => expect(other.plan().bases[1]!.day_budget).toBeNull());
  });

  it("Esc 收起", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const editor = await openDayBudget(user, "10.2");
    await user.click(field(editor, "几点起"));
    await user.keyboard("{Escape}");
    expect(within(await dayRow("10.2")).queryByRole("group", { name: /的时间预算$/ })).toBeNull();
  });
});

describe("展开的收起后焦点回到菜单按钮", () => {
  it("改时区点取消", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "改时区…" }));
    await user.click(within(await dayRow("10.1")).getByRole("button", { name: "取消" }));
    await waitFor(async () => expect(document.activeElement).toBe(await menuButtonOf("10.1")));
  });

  it("这天的时间预算点收起", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    const editor = await openDayBudget(user, "10.1");
    await user.click(within(editor).getByRole("button", { name: "收起" }));
    await waitFor(async () => expect(document.activeElement).toBe(await menuButtonOf("10.1")));
  });
});

describe("你设的和实际摆在一起", () => {
  it("计划的默认预算：两行并排，不写超出", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      setPlanSettings(plan, { default_day_budget: { start: "08:00", end: "22:00" } });
      timed(plan, library, oct1!, "西湖", 540, 180);
      timed(plan, library, oct1!, "夜游", 1320, 120);
    });

    const row = await dayRow("10.1");
    expect(row.querySelector("[data-day-facts]")?.textContent).toBe("09:00 起 · 24:00 收工");
    expect(await budgetLineOf("10.1")).toBe("你设的：08:00 起 · 22:00 收工");
    expect(row.textContent).not.toContain("超出");
  });

  it("这天单独加了两项：没有安排也写「你设的」", async () => {
    await openStoredPlan((plan) => {
      const [, oct2] = daysFromOct1(plan, 2);
      setPlanSettings(plan, { default_day_budget: { start: "08:00", end: "22:00" } });
      setDayBudget(plan, oct2!, { max_drive_min: 240, max_drive_km: 300 });
    });

    expect((await dayRow("10.2")).querySelector("[data-day-facts]")).toBeNull();
    expect(await budgetLineOf("10.2")).toBe("你设的：08:00 起 · 22:00 收工 · 最多开 4 小时 · 最多开 300 公里");
  });

  it("没设预算：没有「你设的」这一行", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      timed(plan, library, oct1!, "西湖", 540, 180);
    });

    expect((await dayRow("10.1")).querySelector("[data-day-facts]")?.textContent).toBe("09:00 起 · 12:00 收工");
    expect(await budgetLineOf("10.1")).toBeNull();
  });
});
