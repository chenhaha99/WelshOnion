// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, dayRow, daysFromOct1, openStoredPlan, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 在 10.1 上放几件事，打开计划、切到日程。 */
async function openDay(setup: (plan: Y.Doc, library: Y.Doc, oct1: string) => void): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    setup(plan, library, oct1!);
  });
  await showView("日程");
}

async function schedule(): Promise<HTMLElement> {
  return screen.findByRole("table", { name: "第 1 天 · 10.1 周四 的安排" });
}

/** 时刻表里一行一行写的是什么：事写标题，空档、「没排时间」写那一行的字。 */
async function rowsOf(): Promise<string[]> {
  const table = await schedule();
  return [...table.querySelectorAll<HTMLElement>("tbody > tr")].flatMap((row) => {
    if (row.dataset.blockId) return [row.querySelector<HTMLInputElement>("input[aria-label='标题']")!.value];
    if (row.hasAttribute("data-gap") || row.hasAttribute("data-undated-heading")) return [row.textContent ?? ""];
    return [];
  });
}

describe("一件事一行", () => {
  it("开始时刻、竖线上的「完成」、卡片：时间和多长、标题、类型、标签、开销、操作", async () => {
    await openDay((plan, library, oct1) => {
      const lake = timed(plan, library, oct1, "西湖", "sight", 540, 180);
      if (!addExpense(plan, library, { title: "门票", amountCents: 30000, blockIds: [lake] }).ok) throw new Error("建开销失败");
    });
    const row = await blockRow("10.1", "西湖");
    const [start, rail, card] = [...row.children] as HTMLElement[];

    expect(row.children).toHaveLength(3);
    expect(start!.textContent).toBe("09:00");
    expect(within(rail!).getByRole("button", { name: /^标记：/ })).toBeTruthy();
    expect(within(card!).getByRole("button", { name: "时间" }).textContent).toBe("09:00–12:00");
    expect(card!.querySelector("[data-block-duration]")?.textContent).toBe("· 3 小时");
    expect(within(card!).getByRole("textbox", { name: "标题" })).toHaveProperty("value", "西湖");
    expect(within(card!).getByRole("button", { name: "类型：游玩" })).toBeTruthy();
    expect(within(card!).getByRole("button", { name: "标签：没有" })).toBeTruthy();
    expect(within(card!).getByRole("button", { name: "开销" }).textContent).toContain("¥300");
    expect(within(card!).getByRole("button", { name: "这件事的操作" })).toBeTruthy();
  });

  it("没排时间的在后面：前面一行「没排时间」，开始时刻那一格空着，不写多长", async () => {
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
      if (!addBlock(plan, library, { baseId: oct1, kindId: "sight", title: "灵隐寺", slot: "day", duration: 120 }).ok) {
        throw new Error("建块失败");
      }
    });

    expect(await rowsOf()).toEqual(["西湖", "没排时间", "灵隐寺"]);
    const temple = await blockRow("10.1", "灵隐寺");
    expect(temple.children[0]!.textContent).toBe("");
    expect(within(temple).getByRole("button", { name: "时间" }).textContent).toBe("整天 · 2 小时");
    expect(temple.querySelector("[data-block-duration]")).toBeNull();
  });

  it("点竖线上的圆圈就是完成", async () => {
    const user = userEvent.setup();
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const row = await blockRow("10.1", "西湖");
    await user.click(within(row.children[1] as HTMLElement).getByRole("button", { name: /^标记：/ }));

    await waitFor(async () => expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("done"));
  });
});

describe("空档", () => {
  it("空了一个半小时：中间一行写开始时刻和「空 1.5 小时 · 在 11:00 加一件事」", async () => {
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "开车去杭州", "transit", 480, 180);
      timed(plan, library, oct1, "午饭", "food", 750, 60);
    });

    expect(await rowsOf()).toEqual(["开车去杭州", "11:00空 1.5 小时 · 在 11:00 加一件事", "午饭"]);
  });

  it("空不到半小时不写，停留不算", async () => {
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "在杭州", "stay", 0, 4320);
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
      timed(plan, library, oct1, "午饭", "food", 740, 60);
    });

    expect(await rowsOf()).toEqual(["在杭州", "西湖", "午饭"]);
  });

  it("住宿算：住进去之前空着的下午写出来", async () => {
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "午饭", "food", 720, 60);
      timed(plan, library, oct1, "民宿", "lodging", 1260, 600);
    });

    expect(await rowsOf()).toEqual(["午饭", "13:00空 8 小时 · 在 13:00 加一件事", "民宿"]);
  });

  it("筛掉的事那段不算空", async () => {
    const user = userEvent.setup();
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
      timed(plan, library, oct1, "知味观", "food", 720, 60);
      timed(plan, library, oct1, "雷峰塔", "sight", 780, 120);
    });
    await user.click(within(await screen.findByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));

    await waitFor(async () => expect(await rowsOf()).toEqual(["西湖", "雷峰塔"]));
  });

  it("点空档：弹「加一件事」，写着 11:00–12:00；回车建出来，框关掉，焦点在新那件的标题上", async () => {
    const user = userEvent.setup();
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "开车去杭州", "transit", 480, 180);
      timed(plan, library, oct1, "午饭", "food", 750, 60);
    });
    await user.click(within(await schedule()).getByRole("button", { name: "空 1.5 小时 · 在 11:00 加一件事" }));
    const dialog = await screen.findByRole("dialog", { name: "加一件事" });
    expect(dialog.textContent).toContain("第 1 天 · 10.1 周四 · 11:00–12:00");

    await user.type(within(dialog).getByRole("textbox", { name: "加一件事" }), "雷峰塔{Enter}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "加一件事" })).toBeNull());
    expect(await rowsOf()).toEqual(["开车去杭州", "雷峰塔", "12:00空 30 分钟 · 在 12:00 加一件事", "午饭"]);
    const tower = await blockRow("10.1", "雷峰塔");
    expect(within(tower).getByRole("button", { name: "时间" }).textContent).toBe("11:00–12:00");
    await waitFor(() => expect(document.activeElement).toBe(within(tower).getByRole("textbox", { name: "标题" })));
  });
});

describe("组头", () => {
  it("电脑上挪到左边一列，标签里的字还是「第 1 天 · 10.1 周四」", async () => {
    await openDay((plan, library, oct1) => {
      timed(plan, library, oct1, "西湖", "sight", 540, 180);
    });
    const day = await dayRow("10.1");

    expect(day.querySelector("[data-day-label]")?.textContent).toBe("第 1 天 · 10.1 周四");
    expect(day.querySelector("[data-day-side]")?.contains(day.querySelector("[data-day-label]"))).toBe(true);
    expect(day.querySelector("[data-day-main]")?.contains(await schedule())).toBe(true);
  });
});
