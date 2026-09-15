// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockLayer } from "@welshonion/core";
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
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "时间" })),
    );
  });

  it("没排时间的换天：选了就换到那天、排在那一格最后，焦点到那天的「时间」按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "morning" });
      addBlock(plan, library, { baseId: oct2!, kindId: "sight", title: "宋城", slot: "morning" });
    });

    const editor = await openTime(user, "灵隐寺");
    await user.selectOptions(within(editor).getByRole("combobox", { name: "哪天" }), "第 2 天 · 10.2 周五");

    await waitFor(async () =>
      expect(await blockTexts("10.2")).toEqual([
        { title: "宋城", time: "上午" },
        { title: "灵隐寺", time: "上午" },
      ]),
    );
    expect(await blockTitles("10.1")).toEqual([]);
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await blockRow("10.2", "灵隐寺")).getByRole("button", { name: "时间" })),
    );
  });

  it("排上时间的换天：点「保存」才换，套在里面的跟着走", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const outer = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "横店", minute: 480, duration: 720 });
      const inner = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      if (!outer.ok || !inner.ok) throw new Error("建块失败");
      setBlockLayer(plan, library, inner.value.blockId, outer.value.blockId);
    });

    const editor = await openTime(user, "横店");
    await user.selectOptions(within(editor).getByRole("combobox", { name: "哪天" }), "第 2 天 · 10.2 周五");
    expect(await blockTitles("10.1")).toEqual(["横店", "明清宫苑"]);

    await user.click(within(editor).getByRole("button", { name: "保存" }));

    await waitFor(async () =>
      expect(await blockTexts("10.2")).toEqual([
        { title: "横店", time: "08:00–20:00" },
        { title: "明清宫苑", time: "10:00–12:00" },
      ]),
    );
    expect(await blockTitles("10.1")).toEqual([]);
  });

  it("取消时间：回到整天那一格的最后，时长留着", async () => {
    const user = userEvent.setup();
    await openStoredPlan(oneDayWith({ title: "西湖", minute: 540, duration: 120 }, { title: "灵隐寺", slot: "day" }));

    const editor = await openTime(user, "西湖");
    await user.click(within(editor).getByRole("button", { name: "取消时间" }));

    await waitFor(async () =>
      expect(await blockTexts("10.1")).toEqual([
        { title: "灵隐寺", time: "整天" },
        { title: "西湖", time: "整天 · 2 小时" },
      ]),
    );
  });
});
