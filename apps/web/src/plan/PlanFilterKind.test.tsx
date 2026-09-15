// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockStatus, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTitles, dayRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput, statusId = "pending"): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  if (statusId !== "pending") setBlockStatus(plan, library, [result.value.blockId], statusId);
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, title: string, cents: number, kindId: string, blockIds: string[]): void {
  const result = addExpense(plan, library, { title, amountCents: cents, kindId, blockIds });
  if (!result.ok) throw new Error("建钱失败");
}

/** 10.1：「西湖」（游玩）、「民宿」（住宿）、「午饭」（餐饮），都没排时间。 */
function threeKinds(plan: Y.Doc, library: Y.Doc): { lake: string; inn: string; lunch: string } {
  const [oct1] = daysFromOct1(plan, 1);
  const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
  const inn = block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
  const lunch = block(plan, library, { baseId: oct1!, kindId: "food", title: "午饭", slot: "day" });
  return { lake, inn, lunch };
}

function kindGroup(): HTMLElement {
  return screen.getByRole("group", { name: "按类型筛选" });
}

async function pressKind(user: User, name: string): Promise<void> {
  await user.click(within(await screen.findByRole("group", { name: "按类型筛选" })).getByRole("button", { name }));
}

async function filteredOutOf(day: string): Promise<string | null> {
  return (await dayRow(day)).querySelector("[data-filtered-out]")?.textContent ?? null;
}

async function moneyCellOf(day: string, title: string): Promise<{ label: string | null; note: string | null }> {
  const row = await blockRow(day, title);
  return {
    label: row.querySelector("[data-money-cell]")?.textContent ?? null,
    note: row.querySelector("[data-money-note]")?.textContent ?? null,
  };
}

async function changeKind(user: User, title: string, kind: string): Promise<void> {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: /^类型：/ }));
  await user.click(within(screen.getByRole("dialog", { name: "选择类型" })).getByRole("button", { name: kind }));
}

describe("按类型筛选", () => {
  it("只列用到的类型，按类型的顺序", async () => {
    await openStoredPlan(threeKinds);

    const group = await screen.findByRole("group", { name: "按类型筛选" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["住宿", "餐饮", "游玩"]);
  });

  it("一个块、一笔钱都没有时没有这一排", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    await screen.findByRole("group", { name: "按状态筛选" });
    expect(screen.queryByRole("group", { name: "按类型筛选" })).toBeNull();
  });

  it("只用到一种类型时没有这一排：按下去什么都筛不掉", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));
    expect(screen.queryByRole("group", { name: "按类型筛选" })).toBeNull();
  });

  it("按下了类型，只剩一种类型也留着这一排，不然取消不了", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", slot: "day" });
    });
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "酒店"]));
    await changeKind(user, "酒店", "游玩");
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    // 撤销把「酒店」改回住宿：用到的只剩住宿，但住宿还按着
    await user.click(screen.getByRole("button", { name: "撤销" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "酒店"]));
    expect(within(kindGroup()).getAllByRole("button").map((button) => button.textContent)).toEqual(["住宿", "全部类型"]);
  });

  it("只看住宿：表和时间轴只剩住宿的块", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);

    await pressKind(user, "住宿");

    expect(within(kindGroup()).getByRole("button", { name: "住宿" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    const tray = within(await screen.findByRole("region", { name: "时间轴" })).getByRole("group", { name: "没排时间" });
    expect(within(tray).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["民宿 整天"]);
  });

  it("和状态一起：两样都符合才显示", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" }, "confirmed");
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" }, "confirmed");
    });

    await pressKind(user, "住宿");
    await user.click(within(screen.getByRole("group", { name: "按状态筛选" })).getByRole("button", { name: "已确认" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
  });

  it("全部类型：块全都显示，按钮不见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    await user.click(within(kindGroup()).getByRole("button", { name: "全部类型" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "民宿", "午饭"]));
    expect(await filteredOutOf("10.1")).toBeNull();
    expect(within(kindGroup()).queryByRole("button", { name: "全部类型" })).toBeNull();
  });

  it("改了类型这一行就不显示，焦点落到下一行的类型按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", slot: "day" });
      // 只用到一种类型时没有「类型」那一排，另放一件游玩
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "酒店"]));

    await changeKind(user, "民宿", "游玩");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["酒店"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    const hotelKind = within(await blockRow("10.1", "酒店")).getByRole("button", { name: /^类型：/ });
    await waitFor(() => expect(document.activeElement).toBe(hotelKind));
  });

  it("按下的类型没人用了：按钮还在，还是按下的", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    await changeKind(user, "民宿", "游玩");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    expect(within(kindGroup()).getByRole("button", { name: "住宿" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("只按下住宿时加一件：建出来是住宿、待定，看得见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "酒店{Enter}");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "酒店"]));
    const hotel = await blockRow("10.1", "酒店");
    expect(within(hotel).getByRole("button", { name: /^类型：/ }).getAttribute("aria-label")).toBe("类型：住宿");
    expect(within(hotel).getByRole("button", { name: /^状态：/ }).getAttribute("aria-label")).toBe("状态：待定");
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
  });

  it("按下两个类型时加一件：还是游玩，被筛掉，写「包括刚加的」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);
    await pressKind(user, "住宿");
    await pressKind(user, "餐饮");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "午饭"]));

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");

    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件，包括刚加的「河坊街」"));
    expect(await blockTitles("10.1")).toEqual(["民宿", "午饭"]);
  });
});

describe("按类型筛选时的钱", () => {
  it("钱格只算所选类型，另写一行；钱的总览只算所选类型", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { inn } = threeKinds(plan, library);
      money(plan, library, "房费", 48000, "lodging", [inn]);
      money(plan, library, "早餐", 3000, "food", [inn]);
    });
    await waitFor(async () => expect(await moneyCellOf("10.1", "民宿")).toEqual({ label: "¥510 · 2 笔", note: null }));

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await moneyCellOf("10.1", "民宿")).toEqual({ label: "¥480", note: "另有别的类型的钱" }));
    expect(screen.getByRole("region", { name: "钱的总览" }).textContent).toContain("总额 ¥480");
  });

  it("只挂着别的类型的钱：写「填钱」、另写一行，时间轴详情里没有「钱：」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const hotel = block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", minute: 1320, duration: 600 });
      money(plan, library, "早餐", 3000, "food", [hotel]);
    });

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await moneyCellOf("10.1", "酒店")).toEqual({ label: "填钱", note: "另有别的类型的钱" }));
    const timeline = await screen.findByRole("region", { name: "时间轴" });
    await user.click(within(timeline).getAllByRole("button", { name: /^酒店 / })[0]!);
    const dialog = screen.getByRole("dialog", { name: "酒店" });
    expect(within(dialog).queryByText(/^钱：/)).toBeNull();
  });

  it("挂在被筛掉的块上的钱：日期列表上面写一句，钱的总览算上它", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { lake } = threeKinds(plan, library);
      money(plan, library, "住宿费", 30000, "lodging", [lake]);
    });
    await screen.findByRole("group", { name: "按类型筛选" });
    expect(screen.queryByText(/挂在被筛掉的块上/)).toBeNull();

    await pressKind(user, "住宿");

    const line = await screen.findByText("有 ¥300 挂在被筛掉的块上");
    const list = screen.getByRole("list", { name: "日期列表" });
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await blockTitles("10.1")).toEqual(["民宿"]);
    expect(screen.getByRole("region", { name: "钱的总览" }).textContent).toContain("总额 ¥300");
  });

  it("没有这样的钱就不写", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { inn } = threeKinds(plan, library);
      money(plan, library, "房费", 48000, "lodging", [inn]);
    });

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));
    expect(screen.queryByText(/挂在被筛掉的块上/)).toBeNull();
  });
});
