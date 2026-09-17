// @vitest-environment happy-dom
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, blockTitles, dayRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

describe("每天下面列出这天的块", () => {
  it("有时间的排在前面", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const baseId = oct1!;
      addBlock(plan, library, { baseId, kindId: "food", title: "午饭", minute: 720, duration: 60 });
      addBlock(plan, library, { baseId, kindId: "food", title: "早茶", minute: 480, duration: 60 });
      addBlock(plan, library, { baseId, kindId: "sight", title: "西湖", slot: "day" });
      addBlock(plan, library, { baseId, kindId: "sight", title: "灵隐寺", slot: "afternoon" });
    });

    expect(await blockTexts("10.1")).toEqual([
      { title: "早茶", time: "08:00–09:00" },
      { title: "午饭", time: "12:00–13:00" },
      { title: "西湖", time: "整天" },
      { title: "灵隐寺", time: "下午" },
    ]);
  });

  it("跨午夜和零时长：跨午夜的块只在开始那天出现", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const baseId = oct1!;
      addBlock(plan, library, { baseId, kindId: "lodging", title: "酒店", minute: 1320, duration: 600 });
      addBlock(plan, library, { baseId, kindId: "transit", title: "深圳北出发", minute: 1200, duration: 0 });
    });

    expect(await blockTexts("10.1")).toEqual([
      { title: "深圳北出发", time: "20:00" },
      { title: "酒店", time: "22:00–10.2 08:00" },
    ]);
    expect(await blockTexts("10.2")).toEqual([]);
  });
});

describe("加一件事", () => {
  it("连着加两件：整天、游玩、没划掉，焦点留在输入框", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    const add = within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" });
    await user.type(add, "西湖{Enter}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
    await user.type(add, "灵隐寺{Enter}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));

    for (const title of ["西湖", "灵隐寺"]) {
      const row = await blockRow("10.1", title);
      expect(row.querySelector("[data-block-time]")?.textContent).toBe("整天");
      expect(within(row).getByRole("button", { name: "类型：游玩" })).toBeTruthy();
      expect(row.dataset.checked).toBe("false");
      expect(within(row).queryByRole("button", { name: /^状态/ })).toBeNull();
    }
    expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }));
  });

  it("空标题不建", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "  {Enter}");
    expect(await blockTitles("10.1")).toEqual([]);
  });
});
