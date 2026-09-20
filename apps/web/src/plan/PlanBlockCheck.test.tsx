// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockMark, type AddBlockInput, type BlockMark } from "@welshonion/core";
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

/** 10.1：游玩「西湖」09:00 起 3 小时、游玩「灵隐寺」14:00 起 2 小时、没排时间的购物「河坊街」；哪几件标成什么按标题给。 */
async function oneDay(marks: Record<string, BlockMark> = {}): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    const ids: Record<string, string> = {
      西湖: block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 }),
      灵隐寺: block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", minute: 840, duration: 120 }),
      河坊街: block(plan, library, { baseId: oct1!, kindId: "shopping", title: "河坊街", slot: "day" }),
    };
    for (const [title, mark] of Object.entries(marks)) setBlockMark(plan, [ids[title]!], mark);
  });
}

async function timeline(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "时间线" });
}

/** 时间线上读屏名以「title 」开头的那个按钮（横条、竖条、条上的一件）。 */
async function blockButton(title: string): Promise<HTMLElement> {
  return within(await timeline()).getByRole("button", { name: new RegExp(`^${title} `) });
}

/** 画这件事的那一层（横条、竖条的外框，条上的一件，日程的一行）上记着哪一档，样子按它画。 */
function markOf(element: HTMLElement): string | undefined {
  return element.closest<HTMLElement>("[data-block-id]")!.dataset.mark;
}

/** 换标记的按钮：日程竖线上的圆圈、时间线快捷条第一个。 */
function markButton(scope: HTMLElement): HTMLElement {
  return within(scope).getByRole("button", { name: /^标记：/ });
}

describe("在哪换标记", () => {
  it("时间线上：快捷条第一个按钮转一圈——定了 → 划掉 → 待定 → 定了，焦点留着；Ctrl+Z 撤销", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const bar = screen.getByRole("toolbar", { name: "「西湖」的操作" });
    const toggle = within(bar).getAllByRole("button")[0]!;
    expect(toggle.getAttribute("aria-label")).toBe("标记：定了");
    expect(toggle.getAttribute("title")).toBe("按一下设成「划掉」");

    await user.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-label")).toBe("标记：划掉"));
    expect(document.activeElement).toBe(toggle);
    expect(markOf(await blockButton("西湖"))).toBe("struck");

    await user.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-label")).toBe("标记：待定"));
    expect(markOf(await blockButton("西湖"))).toBe("pending");

    await user.click(toggle);
    await waitFor(() => expect(toggle.getAttribute("aria-label")).toBe("标记：定了"));
    expect(markOf(await blockButton("西湖"))).toBe("decided");

    await user.click(toggle);
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(markOf(await blockButton("西湖"))).toBe("decided"));
  });

  it("日程里：竖线上的圆圈；「这件事的操作」里三档直接选", async () => {
    const user = userEvent.setup();
    await oneDay();

    const row = await blockRow("10.1", "西湖");
    const circle = markButton(row);
    expect(circle.getAttribute("aria-label")).toBe("标记：定了");

    await user.click(circle);

    await waitFor(() => expect(circle.getAttribute("aria-label")).toBe("标记：划掉"));
    expect(document.activeElement).toBe(circle);
    expect(markOf(row)).toBe("struck");
    await showView("时间线");
    expect(markOf(await blockButton("西湖"))).toBe("struck");
  });

  it("菜单里「设成待定」：一下就到，不用点两下", async () => {
    const user = userEvent.setup();
    await oneDay();

    const row = await blockRow("10.1", "西湖");
    await user.click(within(row).getByRole("button", { name: "这件事的操作" }));
    await user.click(await screen.findByRole("menuitem", { name: "设成待定" }));

    await waitFor(async () => expect(markOf(await blockRow("10.1", "西湖"))).toBe("pending"));
  });

  it("手机上：竖条选中，屏幕底部快捷条第一个按钮", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    await user.click(markButton(screen.getByRole("toolbar", { name: "「西湖」的操作" })));

    await waitFor(async () => expect(markOf(await blockButton("西湖"))).toBe("struck"));
  });
});

describe("三档怎么显示", () => {
  it("横条：待定和划掉都记在块上，读屏名末尾写出来；定了照常", async () => {
    await oneDay({ 西湖: "struck", 灵隐寺: "pending" });
    await showView("时间线");

    const lake = await blockButton("西湖");
    expect(markOf(lake)).toBe("struck");
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 划掉了");
    const temple = await blockButton("灵隐寺");
    expect(markOf(temple)).toBe("pending");
    expect(temple.getAttribute("aria-label")).toBe("灵隐寺 14:00–16:00 · 待定");
    expect(markOf(await blockButton("河坊街"))).toBe("decided");
    expect(document.querySelector("[data-checked-mark]")).toBeNull();
  });

  it("「没排时间」栏里的一件、日程的一行也是", async () => {
    await oneDay({ 河坊街: "struck", 西湖: "pending" });

    expect(markOf(await blockRow("10.1", "河坊街"))).toBe("struck");
    expect(markOf(await blockRow("10.1", "西湖"))).toBe("pending");
    await showView("时间线");
    expect(markOf(await blockButton("河坊街"))).toBe("struck");
  });

  it("手机上的竖条也是", async () => {
    stubNarrowScreen();
    await oneDay({ 西湖: "struck", 灵隐寺: "pending" });
    await showView("时间线");

    expect(markOf(await blockButton("西湖"))).toBe("struck");
    expect(markOf(await blockButton("灵隐寺"))).toBe("pending");
  });
});

describe("按标记筛选", () => {
  it("三档都是「定了」时没有这一组", async () => {
    await oneDay();

    await screen.findByRole("group", { name: "按类型筛选" });
    expect(screen.queryByRole("group", { name: "按标记筛选" })).toBeNull();
  });

  it("按下「待定」只剩待定的；按下以后标记都改回去了，按钮还在、还按着", async () => {
    const user = userEvent.setup();
    await oneDay({ 西湖: "pending" });
    await showView("时间线");

    await user.click(within(await screen.findByRole("group", { name: "按标记筛选" })).getByRole("button", { name: "待定" }));

    await waitFor(async () => expect(within(await timeline()).queryByRole("button", { name: /^灵隐寺 / })).toBeNull());
    expect(await blockButton("西湖")).toBeTruthy();

    // 把唯一一件待定的改回「定了」：这一组还在、「待定」还按着，不然取消不了
    await user.click(await blockButton("西湖"));
    const toggle = markButton(screen.getByRole("toolbar", { name: "「西湖」的操作" }));
    await user.click(toggle);
    await user.click(toggle);
    const group = await screen.findByRole("group", { name: "按标记筛选" });
    expect(within(group).getByRole("button", { name: "待定" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("和按类型筛一起：都要满足", async () => {
    const user = userEvent.setup();
    await oneDay({ 西湖: "struck" });
    await showView("时间线");

    const marks = await screen.findByRole("group", { name: "按标记筛选" });
    await user.click(within(marks).getByRole("button", { name: "定了" }));
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));
    // 按状态筛选撤掉了：筛选那一行只有这三样
    expect(screen.queryByRole("group", { name: "按状态筛选" })).toBeNull();

    const region = await timeline();
    await waitFor(() => expect(within(region).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(within(region).getByRole("button", { name: /^灵隐寺 / })).toBeTruthy();
    expect(within(region).queryByRole("button", { name: /^河坊街 / })).toBeNull();
  });
});

describe("待定、划掉各几件", () => {
  it("总览里写「待定 X · 划掉 Y，共 N 件」", async () => {
    await oneDay({ 西湖: "struck", 河坊街: "pending" });
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).getByText("待定 1 件 · 划掉 1 件，共 3 件")).toBeTruthy();
  });

  it("只有划掉的就只写划掉", async () => {
    await oneDay({ 西湖: "struck" });
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).getByText("划掉 1 件，共 3 件")).toBeTruthy();
  });

  it("三档都是「定了」就不写", async () => {
    await oneDay();
    await showView("总览");

    const card = await screen.findByRole("region", { name: "占比" });
    expect(within(card).queryByText(/划掉|待定/)).toBeNull();
  });
});
