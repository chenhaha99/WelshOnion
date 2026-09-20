// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  blockTitles,
  dayLabels,
  daysFromOct1,
  openDayMenu,
  openStoredPlan,
  overviewCard,
  ringLabels,
  showView,
} from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1「西湖」、10.2「民宿」、10.3「灵隐寺」，各一件。 */
function threeDays(plan: Y.Doc, library: Y.Doc): void {
  const [oct1, oct2, oct3] = daysFromOct1(plan, 3);
  block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
  block(plan, library, { baseId: oct2!, kindId: "lodging", title: "民宿", slot: "day" });
  block(plan, library, { baseId: oct3!, kindId: "sight", title: "灵隐寺", slot: "day" });
}

function dayButton(): HTMLElement {
  return screen.getByRole("button", { name: /^按天筛选：/ });
}

/** 点开「天」，点几天，再关掉面板。 */
async function pickDays(user: User, ...numbers: number[]): Promise<void> {
  await user.click(dayButton());
  const panel = await screen.findByRole("dialog", { name: "按天筛选" });
  for (const number of numbers) {
    await user.click(within(panel).getByRole("button", { name: new RegExp(`^第 ${number} 天`) }));
  }
  await user.keyboard("{Escape}");
}

/** 日程里剩下哪几天（只取「第 N 天」那半截）。 */
async function shownDays(): Promise<string[]> {
  return (await dayLabels()).map((label) => label.split(" · ")[0]!);
}

describe("按天筛选", () => {
  it("只有一天的计划没有这个按钮：筛了也没意义", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    await screen.findByRole("group", { name: "视图" });
    expect(screen.queryByRole("button", { name: /^按天筛选：/ })).toBeNull();
  });

  it("一件事都没有的计划没有这个按钮：筛出来也是空的", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await screen.findByRole("group", { name: "视图" });
    expect(screen.queryByRole("button", { name: /^按天筛选：/ })).toBeNull();
  });

  it("选连着的两天：日程只剩这两天，按钮上写「第 1–2 天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeDays);
    await showView("日程");

    await pickDays(user, 1, 2);

    await waitFor(async () => expect(await shownDays()).toEqual(["第 1 天", "第 2 天"]));
    expect(dayButton().textContent).toBe("第 1–2 天");
  });

  it("选不连着的两天：按钮上写「2 天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeDays);
    await showView("日程");

    await pickDays(user, 1, 3);

    await waitFor(async () => expect(await shownDays()).toEqual(["第 1 天", "第 3 天"]));
    expect(dayButton().textContent).toBe("2 天");
  });

  it("跨天的事按开始那天算", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 3);
      // 10.1 晚上 10 点住到第二天早上 8 点
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", minute: 1320, duration: 600 });
    });
    await showView("日程");

    await pickDays(user, 2);
    await waitFor(async () => expect(await shownDays()).toEqual(["第 2 天"]));
    expect(await blockTitles("10.2")).toEqual([]);

    // 再按下第 1 天（第 2 天还按着）
    await pickDays(user, 1);

    await waitFor(async () => expect(await shownDays()).toEqual(["第 1 天", "第 2 天"]));
    expect(await blockTitles("10.1")).toEqual(["民宿"]);
  });

  it("和按类型筛一起：两样都符合才算，总览也只算这些", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 3);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
      block(plan, library, { baseId: oct2!, kindId: "sight", title: "灵隐寺", minute: 540, duration: 120 });
    });
    await showView("日程");

    await pickDays(user, 1);
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
    expect(ringLabels(await overviewCard())).toEqual(["游玩 3 小时 · 100%"]);
  });

  it("全部天：哪天都不筛了，按钮上写「天」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeDays);
    await showView("日程");
    await pickDays(user, 2);
    await waitFor(async () => expect(await shownDays()).toEqual(["第 2 天"]));

    await user.click(dayButton());
    await user.click(within(screen.getByRole("dialog", { name: "按天筛选" })).getByRole("button", { name: "全部天" }));

    await waitFor(async () => expect(await shownDays()).toEqual(["第 1 天", "第 2 天", "第 3 天"]));
    expect(dayButton().textContent).toBe("天");
  });

  it("这天删了：不再算在筛选里", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 3);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      block(plan, library, { baseId: oct2!, kindId: "lodging", title: "民宿", slot: "day" });
    });
    await showView("日程");
    await pickDays(user, 3);
    await waitFor(async () => expect(await shownDays()).toEqual(["第 3 天"]));

    await user.click(within(await openDayMenu(user, "10.3")).getByRole("menuitem", { name: "删除这天" }));

    await waitFor(async () => expect(await shownDays()).toEqual(["第 1 天", "第 2 天"]));
    expect(dayButton().textContent).toBe("天");
  });
});
