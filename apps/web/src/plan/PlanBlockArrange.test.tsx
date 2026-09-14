// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, blockTitles, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type Block = { title: string } & ({ slot: "day" | "morning" | "afternoon" | "evening" } | { minute: number; duration: number });

/** 10.1 一天，按顺序放进这些块（类型都是游玩）。 */
function oneDayWith(...blocks: Block[]) {
  return (plan: Y.Doc, library: Y.Doc) => {
    const [oct1] = daysFromOct1(plan, 1);
    for (const block of blocks) addBlock(plan, library, { baseId: oct1!, kindId: "sight", ...block });
  };
}

async function chooseInBlockMenu(user: ReturnType<typeof userEvent.setup>, title: string, item: string) {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: "这件事的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: item }));
}

async function openTime(user: ReturnType<typeof userEvent.setup>, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: "时间" }));
  return screen.getByRole("group", { name: `${title} 的时间` });
}

async function setDuration(user: ReturnType<typeof userEvent.setup>, editor: HTMLElement, hours: string, minutes: string) {
  const hourInput = within(editor).getByRole("spinbutton", { name: "小时" });
  const minuteInput = within(editor).getByRole("spinbutton", { name: "分钟" });
  await user.clear(hourInput);
  await user.type(hourInput, hours);
  await user.clear(minuteInput);
  await user.type(minuteInput, minutes);
}

describe("没排时间的块排顺序、缩进、换格子", () => {
  it("下移", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", slot: "day" }, { title: "灵隐寺", slot: "day" }));

    await chooseInBlockMenu(user, "西湖", "下移");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺", "西湖"]));
  });

  it("缩进再取消", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", slot: "day" }, { title: "灵隐寺", slot: "day" }));
    const indentOf = async () => (await blockRow("10.1", "灵隐寺")).querySelector("td")?.dataset.indent;

    await chooseInBlockMenu(user, "灵隐寺", "缩进");
    await waitFor(async () => expect(await indentOf()).toBe("1"));
    await chooseInBlockMenu(user, "灵隐寺", "取消缩进");
    await waitFor(async () => expect(await indentOf()).toBe("0"));
  });

  it("换格子：排到那一格最后", async () => {
    const user = userEvent.setup();
    await openStoredPlan(
      oneDayWith({ title: "西湖", slot: "day" }, { title: "灵隐寺", slot: "day" }, { title: "河坊街", slot: "afternoon" }),
    );

    const editor = await openTime(user, "西湖");
    await user.selectOptions(within(editor).getByRole("combobox", { name: "格子" }), "afternoon");
    await waitFor(async () =>
      expect(await blockTexts("10.1")).toEqual([
        { title: "灵隐寺", time: "整天" },
        { title: "河坊街", time: "下午" },
        { title: "西湖", time: "下午" },
      ]),
    );
  });
});

describe("排时间和取消时间", () => {
  it("排上时间", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", slot: "day" }));

    const editor = await openTime(user, "西湖");
    fireEvent.change(within(editor).getByLabelText("开始"), { target: { value: "09:00" } });
    await setDuration(user, editor, "2", "0");
    await user.click(within(editor).getByRole("button", { name: "排上时间" }));

    await waitFor(async () => expect(await blockTexts("10.1")).toEqual([{ title: "西湖", time: "09:00–11:00" }]));
  });

  it("改时长", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", minute: 540, duration: 120 }));

    const editor = await openTime(user, "西湖");
    await setDuration(user, editor, "3", "0");
    await user.click(within(editor).getByRole("button", { name: "保存" }));

    await waitFor(async () => expect(await blockTexts("10.1")).toEqual([{ title: "西湖", time: "09:00–12:00" }]));
  });

  it("取消时间：回到整天那一格的最后", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", minute: 540, duration: 120 }, { title: "灵隐寺", slot: "day" }));

    const editor = await openTime(user, "西湖");
    await user.click(within(editor).getByRole("button", { name: "取消时间" }));

    await waitFor(async () =>
      expect(await blockTexts("10.1")).toEqual([
        { title: "灵隐寺", time: "整天" },
        { title: "西湖", time: "整天" },
      ]),
    );
  });
});
