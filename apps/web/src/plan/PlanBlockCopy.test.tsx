// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { addBlock, addExpense, setBlockLayer } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 10.1、10.2 两天；10.1「西湖」09:00 起 3 小时，挂着 300 元。 */
async function openWestLake(): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 2);
    const added = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    if (!added.ok) throw new Error("建块失败");
    addExpense(plan, library, { title: "门票", amountCents: 30000, blockIds: [added.value.blockId] });
  });
}

/** 打开某件事的行菜单，点「复制到…」，再点那一天。 */
async function copyTo(user: UserEvent, day: string, title: string, target: string): Promise<void> {
  await user.click(within(await blockRow(day, title)).getByRole("button", { name: "这件事的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "复制到…" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: target }));
}

function notice(): string {
  return within(screen.getByRole("status", { name: "刚做完的提示" })).queryByText(/复制到了/)?.textContent ?? "";
}

describe("日程里复制到另一天", () => {
  it("复制到第二天：同一时刻、连开销；底部提示，焦点回到原来这件的行菜单", async () => {
    const user = userEvent.setup();
    await openWestLake();

    await copyTo(user, "10.1", "西湖", "第 2 天 · 10.2 周五");

    await waitFor(async () => expect(await blockTexts("10.2")).toEqual([{ title: "西湖", time: "09:00–12:00" }]));
    expect((await blockRow("10.2", "西湖")).querySelector("[data-money-cell]")?.textContent).toBe("¥300");
    expect(await blockTexts("10.1")).toEqual([{ title: "西湖", time: "09:00–12:00" }]);
    expect(notice()).toBe("把「西湖」复制到了第 2 天 · 10.2 周五");
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }),
      ),
    );
  });

  it("选这天是原地多一份", async () => {
    const user = userEvent.setup();
    await openWestLake();

    await copyTo(user, "10.1", "西湖", "第 1 天 · 10.1 周四（这天）");

    await waitFor(async () =>
      expect(await blockTexts("10.1")).toEqual([
        { title: "西湖", time: "09:00–12:00" },
        { title: "西湖", time: "09:00–12:00" },
      ]),
    );
  });

  it("一步撤销", async () => {
    const user = userEvent.setup();
    await openWestLake();

    await copyTo(user, "10.1", "西湖", "第 2 天 · 10.2 周五");
    await waitFor(async () => expect(await blockTexts("10.2")).toHaveLength(1));
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(async () => expect(await blockTexts("10.2")).toEqual([]));
    expect(await blockTexts("10.1")).toEqual([{ title: "西湖", time: "09:00–12:00" }]);
  });

  it("连同里面的事一起复制，提示写件数", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const outer = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "横店一整天", minute: 480, duration: 720 });
      const inner = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      if (!outer.ok || !inner.ok) throw new Error("建块失败");
      setBlockLayer(plan, library, inner.value.blockId, outer.value.blockId);
    });

    await copyTo(user, "10.1", "横店一整天", "第 2 天 · 10.2 周五");

    await waitFor(async () =>
      expect(await blockTexts("10.2")).toEqual([
        { title: "横店一整天", time: "08:00–20:00" },
        { title: "明清宫苑", time: "10:00–12:00" },
      ]),
    );
    expect(notice()).toBe("把「横店一整天」和里面的 1 件复制到了第 2 天 · 10.2 周五");
  });

  it("没排时间的事没有「复制到…」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "shopping", title: "买手信", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "买手信")).getByRole("button", { name: "这件事的操作" }));

    expect(within(screen.getByRole("menu")).queryByRole("menuitem", { name: "复制到…" })).toBeNull();
  });
});
