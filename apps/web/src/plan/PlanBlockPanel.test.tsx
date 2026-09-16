// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockLayer, updateBlock, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, blockTitles, daysFromOct1, openDetails, openStoredPlan, selectedText, showView } from "./test-helpers";

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

/** 这一行「没排时间」栏里每件的读屏名，按顺序。 */
function chipNames(row: HTMLElement): string[] {
  return [...within(row).getByRole("group", { name: "没排时间" }).querySelectorAll("[data-undated-chip] > button")].map(
    (button) => button.getAttribute("aria-label") ?? "",
  );
}

function panelOf(title: string): HTMLElement {
  return screen.getByRole("dialog", { name: title });
}

async function openInTimeline(user: User, day: string, title: string): Promise<HTMLElement> {
  await openDetails(user, thing(await timelineRow(day), title));
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

describe("打开和关掉详情面板", () => {
  it("从时间轴打开：名字是标题，焦点在面板上", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");

    expect(document.activeElement).toBe(panel);
  });

  it("从列表的「详情…」打开：焦点在备注（都空着时在「加备注」上）", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInList(user, "10.1", "西湖");

    await waitFor(() => expect(document.activeElement).toBe(buttonIn(panel, "加备注")));
    await user.click(buttonIn(panel, "加备注"));
    expect(document.activeElement).toBe(within(panel).getByLabelText("短备注"));
  });

  it("开着时点另一件：换成那件的面板", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      lakeAtNine(plan, library);
      const oct1 = [...plan.getMap("bases").keys()][0]!;
      block(plan, library, { baseId: oct1, kindId: "food", title: "午饭", minute: 720, duration: 60 });
    });

    await openInTimeline(user, "10.1", "西湖");
    await user.click(thing(await timelineRow("10.1"), "午饭"));

    expect(screen.getAllByRole("dialog").map((dialog) => dialog.getAttribute("aria-label"))).toEqual(["午饭"]);
  });

  it("Esc 关掉：焦点回到横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);
    const bar = thing(await timelineRow("10.1"), "西湖");

    await user.click(bar);
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(bar));
  });

  it("换了天再关：焦点到它现在那一行的横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    });

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "时间"));
    const editor = within(panel).getByRole("group", { name: "西湖 的时间" });
    await user.selectOptions(within(editor).getByRole("combobox", { name: "哪天" }), "第 2 天 · 10.2 周五");
    await user.click(within(editor).getByRole("button", { name: "保存" }));
    await waitFor(async () => expect(within(await timelineRow("10.2")).queryByRole("button", { name: /^西湖 / })).toBeTruthy());

    await user.click(buttonIn(panelOf("西湖"), "关闭"));

    await waitFor(async () => expect(document.activeElement).toBe(thing(await timelineRow("10.2"), "西湖")));
  });

  it("这件事被撤销掉了：面板自己关", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await user.type(within(await timelineRow("10.1")).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");
    await waitFor(async () => expect(chipNames(await timelineRow("10.1"))).toEqual(["河坊街 整天"]));

    await openInTimeline(user, "10.1", "河坊街");
    await user.keyboard("{Control>}z{/Control}");

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "河坊街" })).toBeNull());
  });
});

describe("面板里有什么", () => {
  it("住一晚：点第二天那段", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const inn = block(plan, library, {
        baseId: oct1!,
        kindId: "lodging",
        statusId: "confirmed",
        title: "民宿",
        minute: 1320,
        duration: 600,
      });
      updateBlock(plan, library, inn, { subtitle: "湖景房" });
      addExpense(plan, library, { title: "房费", amountCents: 48000, blockIds: [inn] });
    });

    const panel = await openInTimeline(user, "10.2", "民宿");

    expect(within(panel).getByLabelText("标题")).toHaveProperty("value", "民宿");
    expect(buttonIn(panel, "类型：住宿")).toBeTruthy();
    expect(buttonIn(panel, "状态：已确认")).toBeTruthy();
    expect(buttonIn(panel, "时间").textContent).toBe("22:00–10.2 08:00 · 10 小时");
    expect(buttonIn(panel, "钱").textContent).toBe("¥480");
    expect(within(panel).getByLabelText("短备注")).toHaveProperty("value", "湖景房");
  });

  it("路程和长备注；没挂钱写「填钱」", async () => {
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
    expect(buttonIn(panel, "钱").textContent).toBe("填钱");
  });

  it("没排时间的：有上移、下移、缩进，没有推迟、放在哪、复制到", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "morning", duration: 120 });
    });

    const panel = await openInTimeline(user, "10.1", "灵隐寺");

    expect(buttonIn(panel, "时间").textContent).toBe("上午 · 2 小时");
    for (const name of ["上移", "下移", "缩进"]) expect(buttonIn(panel, name)).toBeTruthy();
    expect(within(panel).queryByRole("group", { name: "这天从这件起往后推迟" })).toBeNull();
    expect(within(panel).queryByRole("combobox", { name: "放在哪" })).toBeNull();
    expect(within(panel).queryByRole("combobox", { name: "复制到" })).toBeNull();
  });

  it("改标题：面板的名字和横条跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    const title = within(panel).getByLabelText("标题");
    await user.clear(title);
    await user.type(title, "西湖游船{Enter}");

    await waitFor(() => expect(panelOf("西湖游船")).toBeTruthy());
    expect(within(await timelineRow("10.1")).getByRole("button", { name: "西湖游船 09:00–12:00" })).toBeTruthy();
  });

  it("改时间：编辑区收起，面板留着，焦点在「时间」按钮上，横条挪了", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "时间"));
    const editor = within(panel).getByRole("group", { name: "西湖 的时间" });
    fireEvent.change(within(editor).getByLabelText("开始"), { target: { value: "10:00" } });
    await user.click(within(editor).getByRole("button", { name: "保存" }));

    await waitFor(() => expect(buttonIn(panelOf("西湖"), "时间").textContent).toBe("10:00–13:00 · 3 小时"));
    expect(within(panelOf("西湖")).queryByRole("group", { name: "西湖 的时间" })).toBeNull();
    expect(document.activeElement).toBe(buttonIn(panelOf("西湖"), "时间"));
    expect(segmentOf(await timelineRow("10.1"), "西湖").dataset).toMatchObject({ from: "600", to: "780" });
  });

  it("Esc 在时间的编辑区里：只收起编辑区，面板留着", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "时间"));
    await user.click(within(within(panel).getByRole("group", { name: "西湖 的时间" })).getByLabelText("开始"));
    await user.keyboard("{Escape}");

    expect(within(panelOf("西湖")).queryByRole("group", { name: "西湖 的时间" })).toBeNull();
    expect(document.activeElement).toBe(buttonIn(panelOf("西湖"), "时间"));
  });

  it("填钱：收起后「钱」按钮写着钱数，焦点在它上面", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "钱"));
    const editor = within(panel).getByRole("group", { name: "西湖 的钱" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "300{Enter}");
    await user.click(within(editor).getByRole("button", { name: "收起" }));

    await waitFor(() => expect(buttonIn(panelOf("西湖"), "钱").textContent).toBe("¥300"));
    expect(document.activeElement).toBe(buttonIn(panelOf("西湖"), "钱"));
  });

  it("填短备注，点「关闭」：列表里标题下面写着", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "加备注"));
    await user.type(within(panel).getByLabelText("短备注"), "看落日");
    await user.click(buttonIn(panel, "关闭"));

    await waitFor(async () =>
      expect((await blockRow("10.1", "西湖")).querySelector("[data-block-subtitle]")?.textContent).toBe("看落日"),
    );
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

describe("复制到另一天", () => {
  it("连同钱复制到那天同一时刻；面板留在原来这件上；一步撤销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      addExpense(plan, library, { title: "船票", amountCents: 30000, blockIds: [lake] });
    });

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.selectOptions(within(panel).getByRole("combobox", { name: "复制到" }), "第 2 天 · 10.2 周五");

    await waitFor(() => expect(within(panelOf("西湖")).getByText("复制到了第 2 天 · 10.2 周五")).toBeTruthy());
    expect(selectedText(within(panelOf("西湖")).getByRole("combobox", { name: "复制到" }))).toBe("选一天");
    await user.click(buttonIn(panelOf("西湖"), "关闭"));

    expect(await blockTexts("10.1")).toEqual([{ title: "西湖", time: "09:00–12:00" }]);
    expect(await blockTexts("10.2")).toEqual([{ title: "西湖", time: "09:00–12:00" }]);
    expect((await blockRow("10.2", "西湖")).querySelector("[data-money-cell]")?.textContent).toBe("¥300");
    expect(screen.getByRole("region", { name: "钱的总览" }).textContent).toContain("总额 ¥600");

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await blockTitles("10.2")).toEqual([]));
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

    await waitFor(async () => expect(chipNames(await timelineRow("10.1"))).toEqual(["灵隐寺 整天", "西湖 整天"]));
    expect(buttonIn(panelOf("西湖"), "下移")).toHaveProperty("disabled", true);
    expect(buttonIn(panelOf("西湖"), "上移")).toHaveProperty("disabled", false);
    expect(panelOf("西湖").contains(document.activeElement)).toBe(true);

    await user.click(buttonIn(panelOf("西湖"), "缩进"));
    await waitFor(() => expect(buttonIn(panelOf("西湖"), "取消缩进")).toBeTruthy());
    const chip = thing(await timelineRow("10.1"), "西湖").closest<HTMLElement>("[data-undated-chip]")!;
    expect(chip.style.marginLeft).toBe("12px");
    expect((await blockRow("10.1", "西湖")).querySelector("td")?.dataset.indent).toBe("1");
  });
});

describe("在面板里删除", () => {
  it("时间轴上删掉：焦点到这天的「这天的操作」；撤销后回到横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan(lakeAtNine);

    const panel = await openInTimeline(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "删除"));

    expect(screen.queryByRole("dialog", { name: "西湖" })).toBeNull();
    const notice = screen.getByRole("status", { name: "删完的提示" });
    await waitFor(() => expect(within(notice).getByText("删掉了「西湖」")).toBeTruthy());
    const row = await timelineRow("10.1");
    expect(within(row).queryByRole("button", { name: /^西湖 / })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(row).getByRole("button", { name: "这天的操作" })));

    await user.click(within(notice).getByRole("button", { name: "撤销" }));
    await waitFor(async () => expect(document.activeElement).toBe(thing(await timelineRow("10.1"), "西湖")));
  });

  it("套着块时写连同里面的几个", async () => {
    const user = userEvent.setup();
    await openStoredPlan(hengdian(true));

    const panel = await openInTimeline(user, "10.1", "横店");

    expect(buttonIn(panel, "删除（连同里面的 1 个）")).toBeTruthy();
  });

  it("列表里删：焦点到下一行的「这件事的操作」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    const panel = await openInList(user, "10.1", "西湖");
    await user.click(buttonIn(panel, "删除"));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "这件事的操作" })),
    );
  });
});
