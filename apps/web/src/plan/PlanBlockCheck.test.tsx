// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockChecked, type AddBlockInput } from "@welshonion/core";
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

/** 10.1：游玩「西湖」09:00 起 3 小时、游玩「灵隐寺」14:00 起 2 小时、没排时间的购物「河坊街」；划掉哪几件按标题给。 */
async function oneDay(struck: string[] = []): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    const ids: Record<string, string> = {
      西湖: block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 }),
      灵隐寺: block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", minute: 840, duration: 120 }),
      河坊街: block(plan, library, { baseId: oct1!, kindId: "shopping", title: "河坊街", slot: "day" }),
    };
    if (struck.length > 0) setBlockChecked(plan, struck.map((title) => ids[title]!), true);
  });
}

async function timeline(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "时间线" });
}

/** 时间线上读屏名以「title 」开头的那个按钮（横条、竖条、条上的一件）。 */
async function blockButton(title: string): Promise<HTMLElement> {
  return within(await timeline()).getByRole("button", { name: new RegExp(`^${title} `) });
}

/** 画这件事的那一层（横条、竖条的外框，条上的一件，日程的一行）上记着划没划掉，样子按它画。 */
function struck(element: HTMLElement): boolean {
  return element.closest<HTMLElement>("[data-block-id]")!.dataset.checked === "true";
}

describe("在哪划掉", () => {
  it("时间线上：快捷条第一个是「划掉」，点了块画成划掉的样子、焦点留着；Ctrl+Z 撤销", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const bar = screen.getByRole("toolbar", { name: "「西湖」的操作" });
    const toggle = within(bar).getAllByRole("button")[0]!;
    expect(toggle.getAttribute("aria-label")).toBe("划掉");
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    expect(within(bar).queryByRole("button", { name: /^状态/ })).toBeNull();

    await user.click(toggle);

    await waitFor(() => expect(toggle.getAttribute("aria-pressed")).toBe("true"));
    expect(document.activeElement).toBe(toggle);
    expect(struck(await blockButton("西湖"))).toBe(true);

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(struck(await blockButton("西湖"))).toBe(false));
  });

  it("日程里：竖线上的圆圈", async () => {
    const user = userEvent.setup();
    await oneDay();

    const row = await blockRow("10.1", "西湖");
    const box = within(row).getByRole("checkbox", { name: "划掉" }) as HTMLInputElement;
    expect(box.checked).toBe(false);
    await user.click(box);

    await waitFor(() => expect(box.checked).toBe(true));
    expect(document.activeElement).toBe(box);
    expect(struck(row)).toBe(true);
    await showView("时间线");
    expect(struck(await blockButton("西湖"))).toBe(true);
  });

  it("手机上：竖条选中，屏幕底部快捷条的「划掉」", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    await user.click(within(screen.getByRole("toolbar", { name: "「西湖」的操作" })).getByRole("button", { name: "划掉" }));

    await waitFor(async () => expect(struck(await blockButton("西湖"))).toBe(true));
  });
});

describe("划掉的怎么显示", () => {
  it("横条画成划掉的样子，读屏名末尾加「 · 划掉了」；没划掉的照常；块上没有角标", async () => {
    await oneDay(["西湖"]);
    await showView("时间线");

    const lake = await blockButton("西湖");
    expect(struck(lake)).toBe(true);
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 划掉了");
    const temple = await blockButton("灵隐寺");
    expect(struck(temple)).toBe(false);
    expect(temple.getAttribute("aria-label")).toBe("灵隐寺 14:00–16:00");
    expect(document.querySelector("[data-checked-mark]")).toBeNull();
  });

  it("「没排时间」栏里的一件、日程的一行也是", async () => {
    await oneDay(["河坊街"]);

    expect(struck(await blockRow("10.1", "河坊街"))).toBe(true);
    expect(struck(await blockRow("10.1", "西湖"))).toBe(false);
    await showView("时间线");
    expect(struck(await blockButton("河坊街"))).toBe(true);
  });

  it("手机上的竖条也是", async () => {
    stubNarrowScreen();
    await oneDay(["西湖"]);
    await showView("时间线");

    expect(struck(await blockButton("西湖"))).toBe(true);
    expect(struck(await blockButton("灵隐寺"))).toBe(false);
  });
});

describe("只看没划掉的", () => {
  it("一件都没划掉时没有这个按钮", async () => {
    await oneDay();

    await screen.findByRole("group", { name: "按类型筛选" });
    expect(screen.queryByRole("button", { name: "只看没划掉的" })).toBeNull();
  });

  it("按下后时间线只剩没划掉的", async () => {
    const user = userEvent.setup();
    await oneDay(["西湖"]);
    await showView("时间线");

    await user.click(await screen.findByRole("button", { name: "只看没划掉的" }));

    await waitFor(async () =>
      expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull(),
    );
    expect(await blockButton("灵隐寺")).toBeTruthy();
  });

  it("按下以后划掉的都取消了：按钮还在、还按着，不然取消不了", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    await user.click(within(screen.getByRole("toolbar", { name: "「西湖」的操作" })).getByRole("button", { name: "划掉" }));
    const onlyUnchecked = await screen.findByRole("button", { name: "只看没划掉的" });
    await user.click(onlyUnchecked);
    await waitFor(async () =>
      expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull(),
    );

    await user.keyboard("{Control>}z{/Control}");

    await waitFor(async () => expect(await blockButton("西湖")).toBeTruthy());
    expect(screen.getByRole("button", { name: "只看没划掉的" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("和按类型筛一起：都要满足", async () => {
    const user = userEvent.setup();
    await oneDay(["西湖"]);
    await showView("时间线");

    await user.click(await screen.findByRole("button", { name: "只看没划掉的" }));
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));
    // 按状态筛选撤掉了：筛选那一行只有这两样
    expect(screen.queryByRole("group", { name: "按状态筛选" })).toBeNull();

    const region = await timeline();
    await waitFor(() => expect(within(region).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(within(region).getByRole("button", { name: /^灵隐寺 / })).toBeTruthy();
    expect(within(region).queryByRole("button", { name: /^河坊街 / })).toBeNull();
  });
});

describe("划掉了几件", () => {
  it("总览里写「划掉 K 件，共 N 件」", async () => {
    await oneDay(["西湖", "河坊街"]);
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).getByText("划掉 2 件，共 3 件")).toBeTruthy();
    expect(within(card).queryByRole("group", { name: "定没定" })).toBeNull();
  });

  it("一件都没划掉就不写", async () => {
    await oneDay();
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).queryByText(/^划掉/)).toBeNull();
  });
});
