// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { addBlock, addTag, setBlockMark, setBlockTag, updateBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan, pressedView, showView, stubNarrowScreen } from "./test-helpers";

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

/**
 * 三天：10.1「西湖」09:00 起 1 小时、没排时间的「西湖边喝茶」（餐饮，别的都是游玩）；
 * 10.2「灵隐寺」09:00 起（长备注「记得带伞」）；10.3「西湖夜游」19:00 起 2 小时，nightTourStruck 时完成了。
 */
async function threeDays({ nightTourStruck = false } = {}): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1, oct2, oct3] = daysFromOct1(plan, 3);
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
    block(plan, library, { baseId: oct1!, kindId: "food", title: "西湖边喝茶", slot: "day" });
    const temple = block(plan, library, { baseId: oct2!, kindId: "sight", title: "灵隐寺", minute: 540, duration: 120 });
    updateBlock(plan, library, temple, { note: "记得带伞" });
    const nightTour = block(plan, library, { baseId: oct3!, kindId: "sight", title: "西湖夜游", minute: 1140, duration: 120 });
    if (nightTourStruck) setBlockMark(plan, [nightTour], "done");
  });
}

async function searchButton(): Promise<HTMLButtonElement> {
  return (await screen.findByRole("button", { name: "搜索" })) as HTMLButtonElement;
}

/** 点页顶的「搜索」、输入搜索词，返回面板。 */
async function search(user: UserEvent, query: string): Promise<HTMLElement> {
  await user.click(await searchButton());
  const panel = screen.getByRole("dialog", { name: "搜索" });
  await user.type(within(panel).getByRole("searchbox", { name: "搜索这趟计划" }), query);
  return panel;
}

function results(panel: HTMLElement): HTMLElement[] {
  const list = within(panel).queryByRole("list", { name: "搜索结果" });
  return list ? within(list).getAllByRole("button") : [];
}

async function timeline(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "时间线" });
}

describe("打开搜索", () => {
  it("页顶图标从左到右：搜索、计划设置、撤销、重做", async () => {
    await threeDays();

    await searchButton();
    const labels = [...document.querySelectorAll("[data-top-row] button[aria-label]")].map((button) =>
      button.getAttribute("aria-label"),
    );
    expect(labels).toEqual(["搜索", "计划设置", "撤销", "重做"]);
  });

  it("一件事都没有时不能点", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    expect((await searchButton()).disabled).toBe(true);
  });

  it("打开焦点在搜索框；Esc 关掉，焦点回到「搜索」；再打开搜索框是空的", async () => {
    const user = userEvent.setup();
    await threeDays();

    const panel = await search(user, "西湖");
    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "搜索" })).toBeNull());
    expect(document.activeElement).toBe(await searchButton());

    await user.click(await searchButton());
    const box = within(screen.getByRole("dialog", { name: "搜索" })).getByRole("searchbox", { name: "搜索这趟计划" });
    expect(document.activeElement).toBe(box);
    expect((box as HTMLInputElement).value).toBe("");
    expect(panel.isConnected).toBe(false);
  });
});

describe("结果怎么列", () => {
  it("找到 N 件，按天排，写在哪天什么时间", async () => {
    const user = userEvent.setup();
    await threeDays();

    const panel = await search(user, "西湖");

    expect(within(panel).getByText("找到 3 件")).toBeTruthy();
    expect(results(panel).map((item) => item.textContent)).toEqual([
      "西湖第 1 天 · 10.1 周四 · 09:00–10:00",
      "西湖边喝茶第 1 天 · 10.1 周四 · 没排时间",
      "西湖夜游第 3 天 · 10.3 周六 · 19:00–21:00",
    ]);
  });

  it("命中在备注里多写一行", async () => {
    const user = userEvent.setup();
    await threeDays();

    const panel = await search(user, "带伞");

    expect(results(panel).map((item) => item.textContent)).toEqual(["灵隐寺第 2 天 · 10.2 周五 · 09:00–11:00备注：记得带伞"]);
  });

  it("没找到", async () => {
    const user = userEvent.setup();
    await threeDays();

    const panel = await search(user, "故宫");

    expect(within(panel).getByText("没找到")).toBeTruthy();
    expect(results(panel)).toEqual([]);
  });

  it("被筛掉的也列，写「筛掉了」", async () => {
    const user = userEvent.setup();
    await threeDays({ nightTourStruck: true });
    await user.click(await screen.findByRole("button", { name: "确定" }));

    const panel = await search(user, "夜游");

    expect(results(panel).map((item) => item.textContent)).toEqual(["西湖夜游第 3 天 · 10.3 周六 · 19:00–21:00 · 筛掉了"]);
  });
});

describe("点结果跳过去", () => {
  it("时间线上：面板关掉，选中它，焦点在它的横条上", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("时间线");

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    expect(screen.queryByRole("dialog", { name: "搜索" })).toBeNull();
    const bar = within(await timeline()).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
    expect(screen.getByRole("toolbar", { name: "「西湖夜游」的操作" })).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(bar));
  });

  it("日程里：还是日程，焦点在那一行的「这件事的操作」上", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("日程");

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    expect(pressedView()).toBe("日程");
    const menu = within(await blockRow("10.3", "西湖夜游")).getByRole("button", { name: "这件事的操作" });
    await waitFor(() => expect(document.activeElement).toBe(menu));
  });

  it("在总览：切到时间线并选中", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("总览");

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    await waitFor(() => expect(pressedView()).toBe("时间线"));
    const bar = within(await timeline()).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
  });

  it("被按类型筛掉的：先清掉筛选再选中", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("时间线");
    const filter = await screen.findByRole("group", { name: "按类型筛选" });
    await user.click(within(filter).getByRole("button", { name: "餐饮" }));

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    await waitFor(() => expect(within(filter).queryAllByRole("button", { pressed: true })).toEqual([]));
    const bar = within(await timeline()).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
  });

  it("被按标签筛掉的：也清掉再选中", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const must = addTag(library, { name: "必去", color: "#c08d68" });
      if (!must.ok) throw new Error("建标签失败");
      const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
      setBlockTag(plan, library, [lake], must.value.tagId, true);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖夜游", minute: 1140, duration: 60 });
    });
    await showView("时间线");
    const filter = await screen.findByRole("group", { name: "按标签筛选" });
    await user.click(within(filter).getByRole("button", { name: "必去" }));

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    await waitFor(() => expect(within(filter).queryAllByRole("button", { pressed: true })).toEqual([]));
    const bar = within(await timeline()).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
  });

  it("被「只看没完成的」挡住的：也清掉再选中", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖夜游", minute: 1140, duration: 60 });
      setBlockMark(plan, [lake], "done");
    });
    await showView("时间线");
    const onlyDecided = await screen.findByRole("button", { name: "确定" });
    await user.click(onlyDecided);

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    await waitFor(() => expect(onlyDecided.getAttribute("aria-pressed")).toBe("false"));
    const bar = within(await timeline()).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
  });

  it("没排时间的：选中「没排时间」条上那一件，焦点在它上面", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("时间线");

    const panel = await search(user, "喝茶");
    await user.click(results(panel)[0]!);

    const chip = document.querySelector<HTMLElement>("[data-undated-chip] > button[aria-label^='西湖边喝茶 ']")!;
    await waitFor(() => expect(chip.getAttribute("aria-pressed")).toBe("true"));
    await waitFor(() => expect(document.activeElement).toBe(chip));
  });

  it("手机竖排：翻到那天再选中", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await threeDays();
    await showView("时间线");
    const region = await timeline();
    await waitFor(() => expect(region.querySelector("[data-timeline-day]")?.textContent).toContain("10.1"));

    const panel = await search(user, "夜游");
    await user.click(results(panel)[0]!);

    await waitFor(() => expect(region.querySelector("[data-timeline-day]")?.textContent).toBe("第 3 天 · 10.3 周六"));
    const bar = within(region).getByRole("button", { name: /^西湖夜游 / });
    await waitFor(() => expect(bar.getAttribute("aria-pressed")).toBe("true"));
  });
});

describe("只用键盘搜", () => {
  it("↓ 进结果、↓ 下一条、Enter 跳过去", async () => {
    const user = userEvent.setup();
    await threeDays();
    await showView("时间线");

    const panel = await search(user, "西湖");
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(results(panel)[0]);
    await user.keyboard("{ArrowDown}{Enter}");

    const chip = document.querySelector<HTMLElement>("[data-undated-chip] > button[aria-label^='西湖边喝茶 ']")!;
    await waitFor(() => expect(chip.getAttribute("aria-pressed")).toBe("true"));
  });

  it("第一条上按 ↑ 回到搜索框；最后一条上按 ↓ 不动", async () => {
    const user = userEvent.setup();
    await threeDays();

    const panel = await search(user, "西湖");
    const box = within(panel).getByRole("searchbox", { name: "搜索这趟计划" });
    await user.keyboard("{ArrowDown}{ArrowUp}");
    expect(document.activeElement).toBe(box);

    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(document.activeElement).toBe(results(panel)[2]);
  });
});
