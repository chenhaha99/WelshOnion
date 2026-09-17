// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockChecked, setBlockStatus, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

interface Seed {
  /** 勾上哪几件（按标题） */
  checked?: string[];
  confirmed?: string[];
}

/** 10.1：「西湖」09:00 起 3 小时、「灵隐寺」14:00 起 2 小时、没排时间的「河坊街」；全是游玩、待定。 */
async function oneDay(seed: Seed = {}): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    const ids: Record<string, string> = {
      西湖: block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 }),
      灵隐寺: block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", minute: 840, duration: 120 }),
      河坊街: block(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "day" }),
    };
    if (seed.checked) setBlockChecked(plan, seed.checked.map((title) => ids[title]!), true);
    if (seed.confirmed) setBlockStatus(plan, library, seed.confirmed.map((title) => ids[title]!), "confirmed");
  });
}

async function timeline(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "时间轴" });
}

/** 时间轴上读屏名以「title 」开头的那个按钮（横条、竖条、条上的一件）。 */
async function blockButton(title: string): Promise<HTMLElement> {
  return within(await timeline()).getByRole("button", { name: new RegExp(`^${title} `) });
}

function mark(button: HTMLElement): Element | null {
  return button.querySelector("[data-checked-mark]");
}

describe("在哪勾", () => {
  it("时间轴上：快捷条第一个是「勾」，点了勾上、出角标、焦点留着；Ctrl+Z 撤销", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间轴");

    await user.click(await blockButton("西湖"));
    const bar = screen.getByRole("toolbar", { name: "「西湖」的操作" });
    const toggle = within(bar).getAllByRole("button")[0]!;
    expect(toggle.getAttribute("aria-label")).toBe("勾");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    expect(document.activeElement).toBe(toggle);
    expect(mark(await blockButton("西湖"))).not.toBeNull();

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(mark(await blockButton("西湖"))).toBeNull());
  });

  it("列表里：标题前面的勾选框", async () => {
    const user = userEvent.setup();
    await oneDay();

    const box = within(await blockRow("10.1", "西湖")).getByRole("checkbox", { name: "勾" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);

    await waitFor(() => expect(box.checked).toBe(true));
    expect(document.activeElement).toBe(box);
    await showView("时间轴");
    expect(mark(await blockButton("西湖"))).not.toBeNull();
  });

  it("手机上：竖条选中，屏幕底部快捷条的「勾」", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await oneDay();
    await showView("时间轴");

    await user.click(await blockButton("西湖"));
    await user.click(within(screen.getByRole("toolbar", { name: "「西湖」的操作" })).getByRole("button", { name: "勾" }));

    await waitFor(async () => expect(mark(await blockButton("西湖"))).not.toBeNull());
  });
});

describe("勾上的怎么显示", () => {
  it("横条右上角角标，读屏名末尾加「 · 勾了」；没勾的没有", async () => {
    await oneDay({ checked: ["西湖"] });
    await showView("时间轴");

    const lake = await blockButton("西湖");
    expect(mark(lake)).not.toBeNull();
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 勾了");
    expect(mark(await blockButton("灵隐寺"))).toBeNull();
  });

  it("「没排时间」条上的一件也有角标", async () => {
    await oneDay({ checked: ["河坊街"] });
    await showView("时间轴");

    expect(mark(await blockButton("河坊街"))).not.toBeNull();
  });
});

describe("只看没勾的", () => {
  it("一件都没勾时没有这个按钮", async () => {
    await oneDay();

    await screen.findByRole("group", { name: "按状态筛选" });
    expect(screen.queryByRole("button", { name: "只看没勾的" })).toBeNull();
  });

  it("按下后时间轴只剩没勾的", async () => {
    const user = userEvent.setup();
    await oneDay({ checked: ["西湖"] });
    await showView("时间轴");

    await user.click(await screen.findByRole("button", { name: "只看没勾的" }));

    await waitFor(async () =>
      expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull(),
    );
    expect(await blockButton("灵隐寺")).toBeTruthy();
  });

  it("和「只看」状态一起：都要满足", async () => {
    const user = userEvent.setup();
    await oneDay({ checked: ["西湖"], confirmed: ["西湖", "灵隐寺"] });
    await showView("时间轴");

    await user.click(await screen.findByRole("button", { name: "只看没勾的" }));
    await user.click(within(screen.getByRole("group", { name: "按状态筛选" })).getByRole("button", { name: "已确认" }));

    const region = await timeline();
    await waitFor(() => expect(within(region).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(within(region).getByRole("button", { name: /^灵隐寺 / })).toBeTruthy();
    expect(within(region).queryByRole("button", { name: /^河坊街 / })).toBeNull();
  });
});

describe("勾了几件", () => {
  it("总览里写「勾了 K 件，共 N 件」", async () => {
    await oneDay({ checked: ["西湖", "河坊街"] });
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).getByText("勾了 2 件，共 3 件")).toBeTruthy();
  });

  it("一件都没勾就不写", async () => {
    await oneDay();
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).queryByText(/^勾了/)).toBeNull();
  });
});
