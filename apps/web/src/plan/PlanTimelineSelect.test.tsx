// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockTexts, blockTitles, daysFromOct1, openStoredPlan, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 一天：10.1 有「西湖」09:00 起 3 小时、「午饭」12:00 起 1 小时，另有没排时间的「灵隐寺」。 */
async function onePlanDay(): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [day] = daysFromOct1(plan, 2);
    block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    block(plan, library, { baseId: day!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    block(plan, library, { baseId: day!, kindId: "sight", title: "灵隐寺", slot: "morning", duration: 120 });
  });
  await showView("时间轴");
}

/** 时间轴上读屏名以「title 」开头的那个按钮（横条、竖条或栏里的一件）。 */
async function blockButton(title: string): Promise<HTMLElement> {
  const timeline = await screen.findByRole("region", { name: "时间轴" });
  return within(timeline).getByRole("button", { name: new RegExp(`^${title} `) });
}

/** 这件事的快捷条；没选中就抛错。 */
function quickBar(title: string): HTMLElement {
  return screen.getByRole("toolbar", { name: `「${title}」的操作` });
}

/** 时间轴上选中的是哪几件（读屏名的头一段就是标题）。 */
function selectedTitles(): string[] {
  const blocks = 'section[aria-label="时间轴"] [data-block-id] > button[aria-pressed="true"]';
  return [...document.querySelectorAll(blocks)].map(
    (button) => button.getAttribute("aria-label")?.split(" ")[0] ?? "",
  );
}

describe("时间轴上点一下选中", () => {
  it("点横条选中，不开详情面板", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));

    expect((await blockButton("西湖")).getAttribute("aria-pressed")).toBe("true");
    expect(quickBar("西湖")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("点另一件换过去，再点一下取消", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(await blockButton("午饭"));
    expect(selectedTitles()).toEqual(["午饭"]);
    expect(screen.queryByRole("toolbar", { name: "「西湖」的操作" })).toBeNull();

    await user.click(await blockButton("午饭"));
    expect(selectedTitles()).toEqual([]);
    expect(screen.queryByRole("toolbar", { name: "「午饭」的操作" })).toBeNull();
  });

  it("按 Esc 取消，焦点回到这件事", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    const bar = await blockButton("西湖");
    await user.click(bar);
    await user.keyboard("{Escape}");

    expect(selectedTitles()).toEqual([]);
    expect(document.activeElement).toBe(bar);
  });

  it("点时间轴的空白处取消", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    const axis = document.querySelector<HTMLElement>("[data-timeline-axis]")!;
    await user.click(axis);

    expect(selectedTitles()).toEqual([]);
  });

  it("切到列表取消", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await showView("列表");
    await showView("时间轴");

    expect(selectedTitles()).toEqual([]);
  });

  it("被筛掉就取消", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(screen.getByRole("button", { name: "已确认" }));

    await waitFor(() => expect(selectedTitles()).toEqual([]));
    expect(screen.queryByRole("toolbar", { name: "「西湖」的操作" })).toBeNull();
  });

  it("这件事没了就取消", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await showView("时间轴");
    const timeline = await screen.findByRole("region", { name: "时间轴" });

    await user.type(within(timeline).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");
    await user.click(await blockButton("河坊街"));
    expect(selectedTitles()).toEqual(["河坊街"]);

    await user.keyboard("{Control>}z{/Control}");

    await waitFor(() => expect(selectedTitles()).toEqual([]));
    expect(screen.queryByRole("toolbar", { name: "「河坊街」的操作" })).toBeNull();
  });

  it("点「没排时间」栏里的一件也是选中", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("灵隐寺"));

    expect(selectedTitles()).toEqual(["灵隐寺"]);
    expect(quickBar("灵隐寺")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

});

describe("选中后的快捷条", () => {
  it("排上时间的有七个图标，没排时间的少「复制」「推迟」", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    expect(names(quickBar("西湖"))).toEqual([
      "详情…",
      "类型：游玩",
      "状态：待定",
      "钱：填钱",
      "复制",
      "这天从这件起往后推迟",
      "删除",
    ]);

    await user.click(await blockButton("灵隐寺"));
    expect(names(quickBar("灵隐寺"))).toEqual(["详情…", "类型：游玩", "状态：待定", "钱：填钱", "删除"]);
  });

  it("Tab 进得去，Esc 退出来", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    const lake = await blockButton("西湖");
    await user.click(lake);
    await user.tab();
    expect(document.activeElement).toBe(within(quickBar("西湖")).getByRole("button", { name: "详情…" }));

    await user.keyboard("{Escape}");
    expect(selectedTitles()).toEqual([]);
    expect(document.activeElement).toBe(lake);
  });

  it("改状态：马上生效，焦点回到那个按钮，还选中着", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "状态：待定" }));
    await user.click(within(screen.getByRole("dialog", { name: "选择状态" })).getByRole("button", { name: "已确认" }));

    const status = await waitFor(() => within(quickBar("西湖")).getByRole("button", { name: "状态：已确认" }));
    expect(document.activeElement).toBe(status);
    expect(selectedTitles()).toEqual(["西湖"]);
    const segment = (await blockButton("西湖")).closest<HTMLElement>("[data-segment]")!;
    expect(segment.dataset.pending).toBe("false");
  });

  it("改类型：横条换颜色", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "类型：游玩" }));
    await user.click(within(screen.getByRole("dialog", { name: "选择类型" })).getByRole("button", { name: "餐饮" }));

    await waitFor(() => expect(within(quickBar("西湖")).getByRole("button", { name: "类型：餐饮" })).toBeTruthy());
    const segment = (await blockButton("西湖")).closest<HTMLElement>("[data-segment]")!;
    expect(segment.style.getPropertyValue("--kind-color")).toBe("#c08d68");
  });

  it("钱：一笔都没挂时填一笔，再改，按 Esc 不改", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "钱：填钱" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "300{Enter}");

    const money = await waitFor(() => within(quickBar("西湖")).getByRole("button", { name: "钱：¥300" }));
    expect(document.activeElement).toBe(money);
    expect(screen.getByRole("region", { name: "钱的总览" }).textContent).toContain("总额 ¥300");

    // 还选中着，接着改这一笔
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "钱：¥300" }));
    await user.clear(screen.getByRole("textbox", { name: "金额" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "280{Enter}");
    await waitFor(() => expect(within(quickBar("西湖")).getByRole("button", { name: "钱：¥280" })).toBeTruthy());

    await user.click(within(quickBar("西湖")).getByRole("button", { name: "钱：¥280" }));
    await user.clear(screen.getByRole("textbox", { name: "金额" }));
    await user.type(screen.getByRole("textbox", { name: "金额" }), "500{Escape}");
    await waitFor(() => expect(within(quickBar("西湖")).getByRole("button", { name: "钱：¥280" })).toBeTruthy());
  });

  it("钱：挂着两笔时改为开详情面板、展开钱", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      const lunch = block(plan, library, { baseId: day!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
      addExpense(plan, library, { title: "面", amountCents: 12000, blockIds: [lunch] });
      addExpense(plan, library, { title: "汤", amountCents: 3850, blockIds: [lunch] });
    });
    await showView("时间轴");

    await user.click(await blockButton("午饭"));
    await user.click(within(quickBar("午饭")).getByRole("button", { name: "钱：¥158.50 · 2 笔" }));

    const panel = screen.getByRole("dialog", { name: "午饭" });
    expect(within(panel).getByRole("group", { name: "午饭 的钱" })).toBeTruthy();
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("点一下复制：原地多一件，选中新的，一步撤销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      const lake = block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      addExpense(plan, library, { title: "门票", amountCents: 30000, blockIds: [lake] });
    });
    await showView("时间轴");

    await user.click(await blockButton("西湖"));
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "复制" }));

    // 两件同样时间的「西湖」，各挂一笔 300 元
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "西湖"]));
    expect((await blockTexts("10.1")).map((item) => item.time)).toEqual(["09:00–12:00", "09:00–12:00"]);
    expect(screen.getByRole("region", { name: "钱的总览" }).textContent).toContain("总额 ¥600");

    await showView("时间轴");
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
  });

  it("删除：出提示，焦点落到这天的操作", async () => {
    const user = userEvent.setup();
    await onePlanDay();

    await user.click(await blockButton("西湖"));
    await user.click(within(quickBar("西湖")).getByRole("button", { name: "删除" }));

    await waitFor(() => expect(screen.getByText("删掉了「西湖」")).toBeTruthy());
    expect(selectedTitles()).toEqual([]);
    const timeline = await screen.findByRole("region", { name: "时间轴" });
    await waitFor(() =>
      expect(document.activeElement).toBe(within(timeline).getAllByRole("button", { name: "这天的操作" })[0]),
    );
  });
});

/** 一条快捷条上每个按钮的读屏名，按顺序。 */
function names(bar: HTMLElement): string[] {
  return within(bar)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? "");
}
