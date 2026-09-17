// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockLayer, updateBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  blockRow,
  blockTexts,
  blockTitles,
  daysFromOct1,
  moneyOverview,
  openAddBlock,
  openDetails,
  openStoredPlan,
  selectedText,
  showView,
} from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1 一天，「西湖」09:00 起 3 小时。 */
function lakeAtNine(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
}

/** 10.1 一天：「横店」08:00 起 12 小时、「明清宫苑」10:00 起 2 小时，都是游玩；stacked 时「明清宫苑」叠在「横店」上。 */
function hengdian(stacked: boolean) {
  return (plan: Y.Doc, library: Y.Doc) => {
    const [oct1] = daysFromOct1(plan, 1);
    const outer = block(plan, library, { baseId: oct1!, kindId: "sight", title: "横店", minute: 480, duration: 720 });
    const inner = block(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
    if (stacked) setBlockLayer(plan, library, inner, outer);
  };
}

/** 切到时间轴视图，返回「时间轴」卡片。 */
async function timeline(): Promise<HTMLElement> {
  await showView("时间轴");
  return screen.findByRole("region", { name: "时间轴" });
}

/** 时间轴上标签里含「 day 」的那一行（比如「10.2」）。 */
async function timelineRow(day: string): Promise<HTMLElement> {
  const rows = await within(await timeline()).findAllByRole("listitem");
  const row = rows.find((item) => item.getAttribute("aria-label")!.includes(` ${day} `));
  if (!row) throw new Error(`时间轴上没有 ${day} 那一行`);
  return row;
}

/** 读屏名以「title 」开头的第一个按钮：横条、竖条或栏里的一件。 */
function thing(container: HTMLElement, title: string): HTMLElement {
  return within(container).getAllByRole("button", { name: new RegExp(`^${title} `) })[0]!;
}

function segmentOf(container: HTMLElement, title: string): HTMLElement {
  return thing(container, title).closest<HTMLElement>("[data-segment]")!;
}

/** 时间轴上面那条「没排时间」里每件的读屏名，按顺序。 */
function chipNames(): string[] {
  return [
    ...screen.getByRole("group", { name: "没排时间" }).querySelectorAll("[data-undated-chip] > button"),
  ].map((button) => button.getAttribute("aria-label") ?? "");
}

function panelOf(title: string): HTMLElement {
  return screen.getByRole("dialog", { name: title });
}

async function openInTimeline(user: User, day: string, title: string): Promise<HTMLElement> {
  // 排上时间的在这一行的横轴上；没排时间的在时间轴上面那条里（整个计划共用一条）
  const row = await timelineRow(day);
  const inRow = within(row).queryAllByRole("button", { name: new RegExp(`^${title} `) })[0];
  await openDetails(user, inRow ?? thing(screen.getByRole("group", { name: "没排时间" }), title));
  return panelOf(title);
}

async function openInList(user: User, day: string, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow(day, title)).getByRole("button", { name: "这件事的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "详情…" }));
  return panelOf(title);
}

function buttonIn(panel: HTMLElement, name: string): HTMLElement {
  return within(panel).getByRole("button", { name });
}

describe("打开和关掉详情气泡", () => {
  it("从时间轴打开：名字是标题，焦点在标题框上，不是抽屉", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");

    expect(document.activeElement).toBe(within(panel).getByLabelText("标题"));
    // 气泡不是占满右边的抽屉：宽屏上它是浮在按钮旁边的一张卡片
    expect(panel.className).not.toContain("drawer");
  });

  it("从列表的「详情…」打开：焦点也在标题框上", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInList(user, "10.1", "西湖");

    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText("标题")));
  });

  it("开着时点另一件：气泡关掉，选中换过去", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      lakeAtNine(plan, library);
      const oct1 = [...plan.getMap("bases").keys()][0]!;
      block(plan, library, { baseId: oct1, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    });

    await openInTimeline(user, "10.1", "西湖");
    await user.click(thing(await timelineRow("10.1"), "午饭"));

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    expect(screen.getByRole("toolbar", { name: "「午饭」的操作" })).toBeTruthy();
  });

  it("Esc 关掉：焦点回到快捷条的「详情…」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    await openInTimeline(user, "10.1", "西湖");
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("button", { name: "详情…" })));
  });

  it("这件事被撤销掉了：气泡自己关", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await user.type(await openAddBlock(user, await timelineRow("10.1")), "河坊街{Enter}");
    await user.keyboard("{Escape}");
    await waitFor(async () => expect(chipNames()).toEqual(["河坊街 10.1 整天"]));

    const panel = await openInTimeline(user, "10.1", "河坊街");
    // 焦点先从标题框挪到气泡里的按钮上：输入框里的 Ctrl+Z 是「撤销刚打的字」，不走计划的撤销
    buttonIn(panel, "加备注").focus();
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "河坊街" })).toBeNull());
  });
});

describe("气泡里有什么", () => {
  it("只有标题、备注、路程这些：类型、时间、开销、复制到、删除都不在里面", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const inn = block(plan, library, {
        baseId: oct1!,
        kindId: "lodging",
        title: "民宿",
        minute: 1320,
        duration: 600,
      });
      updateBlock(plan, library, inn, { subtitle: "湖景房" });
      addExpense(plan, library, { title: "房费", amountCents: 48000, blockIds: [inn] });
    });

    const panel = await openInTimeline(user, "10.2", "民宿");

    expect(within(panel).getByLabelText("标题")).toHaveProperty("value", "民宿");
    expect(within(panel).getByLabelText("短备注")).toHaveProperty("value", "湖景房");
    for (const name of ["类型：住宿", "时间", "开销", "删除"]) {
      expect(within(panel).queryByRole("button", { name })).toBeNull();
    }
    expect(within(panel).queryByRole("button", { name: /^状态/ })).toBeNull();
    expect(within(panel).queryByRole("combobox", { name: "复制到" })).toBeNull();
    expect(within(panel).queryByRole("group", { name: "这天从这件起往后推迟" })).toBeNull();
  });

  it("路程和长备注", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const drive = block(plan, library, { baseId: oct1!, kindId: "transit", title: "开车去南浔", minute: 540, duration: 180 });
      updateBlock(plan, library, drive, { transport_mode: "drive", distance_m: 132000, note: "走高速" });
    });

    const panel = await openInTimeline(user, "10.1", "开车去南浔");

    expect(selectedText(within(panel).getByLabelText("交通方式"))).toBe("自驾");
    expect(within(panel).getByLabelText("距离（公里）")).toHaveProperty("value", "132");
    expect(within(panel).getByLabelText("长备注")).toHaveProperty("value", "走高速");
  });

  it("没排时间的：有上移、下移、缩进，没有放在哪", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "morning", duration: 120 });
    });

    const panel = await openInTimeline(user, "10.1", "灵隐寺");

    for (const name of ["上移", "下移", "缩进"]) expect(buttonIn(panel, name)).toBeTruthy();
    expect(within(panel).queryByRole("combobox", { name: "放在哪" })).toBeNull();
  });

  it("改标题：气泡的名字和横条跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    const title = within(panel).getByLabelText("标题");
    await user.clear(title);
    await user.type(title, "西湖游船{Enter}");

    await waitFor(() => expect(panelOf("西湖游船")).toBeTruthy());
    expect(within(await timelineRow("10.1")).getByRole("button", { name: "西湖游船 09:00–12:00" })).toBeTruthy();
  });

  it("填短备注，点「关闭」：列表里标题下面写着", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "加备注"));
    await user.type(within(panelOf("西湖")).getByLabelText("短备注"), "带伞");
    await user.click(buttonIn(panelOf("西湖"), "关闭"));

    await waitFor(async () => expect(within(await blockRow("10.1", "西湖")).getByText("带伞")).toBeTruthy());
  });
});

describe("放在哪", () => {
  it("叠上去，再拿出来", async () => {
    const user = userEvent.setup();
    await openStoredPlan(hengdian(false));

    const panel = await openInTimeline(user, "10.1", "明清宫苑");
    const place = within(panel).getByRole<HTMLSelectElement>("combobox", { name: "放在哪" });
    expect(selectedText(place)).toBe("单独一道");
    expect([...place.options].map((option) => option.textContent)).toEqual(["单独一道", "叠在「横店」上"]);

    await user.selectOptions(place, "叠在「横店」上");
    await waitFor(async () => expect(segmentOf(await timelineRow("10.1"), "明清宫苑").dataset).toMatchObject({ lane: "1", depth: "1" }));
    expect(selectedText(within(panelOf("明清宫苑")).getByRole("combobox", { name: "放在哪" }))).toBe("叠在「横店」上");

    await user.selectOptions(within(panelOf("明清宫苑")).getByRole("combobox", { name: "放在哪" }), "单独一道");
    await waitFor(async () => expect(segmentOf(await timelineRow("10.1"), "明清宫苑").dataset).toMatchObject({ lane: "2", depth: "0" }));
  });

  it("没有能叠上去的：没有这一栏", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");

    expect(within(panel).queryByRole("combobox", { name: "放在哪" })).toBeNull();
  });

  it("类型层不同的不算", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
      block(plan, library, { baseId: oct1!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    });

    const panel = await openInTimeline(user, "10.1", "午饭");

    expect(within(panel).queryByRole("combobox", { name: "放在哪" })).toBeNull();
  });
});

describe("没排时间的上移、下移、缩进", () => {
  it("在时间轴上下移、缩进：栏里跟着变，焦点留在面板里", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "下移"));

    await waitFor(async () => expect(chipNames()).toEqual(["灵隐寺 10.1 整天", "西湖 10.1 整天"]));
    expect(buttonIn(panelOf("西湖"), "下移")).toHaveProperty("disabled", true);
    expect(buttonIn(panelOf("西湖"), "上移")).toHaveProperty("disabled", false);
    expect(panelOf("西湖").contains(document.activeElement)).toBe(true);

    await user.click(buttonIn(panelOf("西湖"), "缩进"));
    await waitFor(() => expect(buttonIn(panelOf("西湖"), "取消缩进")).toBeTruthy());
    const chip = thing(screen.getByRole("group", { name: "没排时间" }), "西湖").closest<HTMLElement>("[data-undated-chip]")!;
    expect(chip.style.marginLeft).toBe("12px");
    expect((await blockRow("10.1", "西湖")).querySelector("td")?.dataset.indent).toBe("1");
  });
});
