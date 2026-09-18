// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, setBlockChecked, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  blockRow,
  blockTitles,
  dayRow,
  daysFromOct1,
  moneyOverview,
  openDetails,
  openOtherTab,
  openStoredPlan,
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

function money(plan: Y.Doc, library: Y.Doc, title: string, cents: number, kindId: string, blockIds: string[]): void {
  const result = addExpense(plan, library, { title, amountCents: cents, kindId, blockIds });
  if (!result.ok) throw new Error("建开销失败");
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

/** 「只看没划掉的」：有划掉的事才出现。 */
async function pressOnlyUnchecked(user: User): Promise<void> {
  await user.click(await screen.findByRole("button", { name: "只看没划掉的" }));
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

  it("一个块、一笔开销都没有时没有这一排", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 1));

    await screen.findByRole("group", { name: "视图" });
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

  it("只看住宿：表和时间线只剩住宿的块", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);

    await pressKind(user, "住宿");

    expect(within(kindGroup()).getByRole("button", { name: "住宿" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    await showView("时间线");
    const tray = within(await screen.findByRole("region", { name: "时间线" })).getByRole("group", { name: "没排时间" });
    expect(within(tray).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual(["民宿 10.1 整天"]);
  });

  it("和只看没划掉的一起：两样都符合才显示", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
      const hotel = block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", slot: "day" });
      block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      setBlockChecked(plan, [hotel], true);
    });

    await pressKind(user, "住宿");
    await pressOnlyUnchecked(user);

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

  it("只按下住宿时加一件：建出来是住宿、没划掉，看得见", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);
    await pressKind(user, "住宿");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "酒店{Enter}");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "酒店"]));
    const hotel = await blockRow("10.1", "酒店");
    expect(within(hotel).getByRole("button", { name: /^类型：/ }).getAttribute("aria-label")).toBe("类型：住宿");
    expect(hotel.dataset.checked).toBe("false");
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
  });

  it("按下两个类型时加一件：建出来还是游玩、被筛掉，写「包括刚加的」，焦点还在「加一件事」", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(threeKinds);
    const other = await openOtherTab(planId);
    await pressKind(user, "住宿");
    await pressKind(user, "餐饮");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿", "午饭"]));

    const add = within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" });
    await user.type(add, "河坊街{Enter}");

    await waitFor(() =>
      expect([...other.plan().blocks.values()].find((item) => item.title === "河坊街")?.kind.id).toBe("sight"),
    );
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件，包括刚加的「河坊街」"));
    expect(await blockTitles("10.1")).toEqual(["民宿", "午饭"]);
    expect(document.activeElement).toBe(add);
  });
});

describe("按类型筛选时的开销", () => {
  it("开销格只算所选类型，另写一行；开销的总览只算所选类型", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { inn } = threeKinds(plan, library);
      money(plan, library, "房费", 48000, "lodging", [inn]);
      money(plan, library, "早餐", 3000, "food", [inn]);
    });
    await waitFor(async () => expect(await moneyCellOf("10.1", "民宿")).toEqual({ label: "¥510 · 2 笔", note: null }));

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await moneyCellOf("10.1", "民宿")).toEqual({ label: "¥480", note: "另有别的类型的开销" }));
    expect((await moneyOverview()).textContent).toContain("总额 ¥480");
  });

  it("只挂着别的类型的开销：写「填开销」、另写一行；时间线上点开，面板的「开销」也这么写", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const hotel = block(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", minute: 1320, duration: 600 });
      money(plan, library, "早餐", 3000, "food", [hotel]);
    });

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await moneyCellOf("10.1", "酒店")).toEqual({ label: "填开销", note: "另有别的类型的开销" }));
    await showView("时间线");
    const timeline = await screen.findByRole("region", { name: "时间线" });
    // 开销在快捷条上：按钮的读屏名写着这块开销格的字
    await user.click(within(timeline).getAllByRole("button", { name: /^酒店 / })[0]!);
    const bar = screen.getByRole("toolbar", { name: "「酒店」的操作" });
    expect(within(bar).getByRole("button", { name: "开销：填开销" })).toBeTruthy();
  });

  it("挂在被筛掉的事上的开销：日期列表上面写一句，开销的总览算上它", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { lake } = threeKinds(plan, library);
      money(plan, library, "住宿费", 30000, "lodging", [lake]);
    });
    await screen.findByRole("group", { name: "按类型筛选" });
    expect(screen.queryByText(/挂在被筛掉的事上/)).toBeNull();

    await pressKind(user, "住宿");

    await showView("日程");
    const line = await screen.findByText("有 ¥300 挂在被筛掉的事上");
    const list = screen.getByRole("list", { name: "日期列表" });
    expect(line.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(await blockTitles("10.1")).toEqual(["民宿"]);
    expect((await moneyOverview()).textContent).toContain("总额 ¥300");
  });

  it("没有这样的开销就不写", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const { inn } = threeKinds(plan, library);
      money(plan, library, "房费", 48000, "lodging", [inn]);
    });

    await pressKind(user, "住宿");

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));
    expect(screen.queryByText(/挂在被筛掉的事上/)).toBeNull();
  });
});

describe("筛选作用到开销、占比和这天怎么样", () => {
  it("开销的总览：挂在被筛掉的块上的开销不算，不属于任何一天不变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      const lunch = block(plan, library, { baseId: oct1!, kindId: "sight", title: "午饭", slot: "day" });
      setBlockChecked(plan, [lake], true);
      money(plan, library, "门票", 30000, "sight", [lake]);
      money(plan, library, "午饭钱", 12000, "sight", [lunch]);
      money(plan, library, "签证", 60000, "other", []);
    });

    await pressOnlyUnchecked(user);
    const overview = (await moneyOverview());
    await waitFor(() =>
      expect(overview.querySelector("[data-money-summary]")?.textContent).toBe("总额 ¥720 · 人均 ¥720 · 已填 2 / 共 2 笔"),
    );
    expect(within(overview).getByRole("button", { name: "不属于任何一天：¥600" })).toBeTruthy();
  });

  it("共用的开销显示在通过筛选的块上", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const first = block(plan, library, { baseId: oct1!, kindId: "lodging", title: "民宿", slot: "day" });
      const second = block(plan, library, { baseId: oct2!, kindId: "lodging", title: "民宿", slot: "day" });
      setBlockChecked(plan, [first], true);
      money(plan, library, "民宿两晚", 50000, "lodging", [first, second]);
    });

    await pressOnlyUnchecked(user);
    await waitFor(async () =>
      expect((await blockRow("10.2", "民宿")).querySelector("[data-money-cell]")?.textContent).toBe("¥500"),
    );
  });

  it("占比和这天怎么样", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
      block(plan, library, { baseId: oct1!, kindId: "food", title: "晚饭", minute: 1080, duration: 60 });
      setBlockChecked(plan, [lake], true);
    });

    await pressOnlyUnchecked(user);
    await waitFor(async () =>
      expect((await dayRow("10.1")).querySelector("[data-day-facts]")?.textContent).toBe("18:00 起 · 19:00 收工"),
    );
    await showView("总览");
    const card = screen.getByRole("region", { name: "占比" });
    const time = within(card).getByRole("group", { name: "时间的占比" });
    expect(within(time).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["餐饮 1 小时 · 100%"]);
  });
});

describe("筛选开着时改块", () => {
  /** 10.1：「西湖」「午饭」「灵隐寺」，都没排时间；「午饭」划掉了（有划掉的，「只看没划掉的」才出来）。 */
  function threeThings(plan: Y.Doc, library: Y.Doc): void {
    const [oct1] = daysFromOct1(plan, 1);
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    const lunch = block(plan, library, { baseId: oct1!, kindId: "sight", title: "午饭", slot: "day" });
    block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    setBlockChecked(plan, [lunch], true);
  }

  /** 日程里点这一行标题前面的「划掉」。 */
  async function strike(user: User, title: string): Promise<void> {
    await user.click(within(await blockRow("10.1", title)).getByRole("checkbox", { name: "划掉" }));
  }

  it("挨个划掉：这一行被筛掉，焦点落到下一行的「划掉」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressOnlyUnchecked(user);
    await strike(user, "西湖");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "灵隐寺")).getByRole("checkbox", { name: "划掉" }),
      ),
    );
  });

  it("最后一件也划掉了：焦点落到这天的菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressOnlyUnchecked(user);
    await strike(user, "西湖");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await strike(user, "灵隐寺");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 3 件");
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("button", { name: "这天的操作" })),
    );
  });

  it("筛选变了就不再写「包括刚加的」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeKinds);
    // 新加的事没划掉，「只看没划掉的」挡不住它：按两个类型挡
    await pressKind(user, "住宿");
    await pressKind(user, "餐饮");
    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件，包括刚加的「河坊街」"));

    await user.click(within(kindGroup()).getByRole("button", { name: "全部类型" }));
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBeNull());
    await pressKind(user, "住宿");
    await pressKind(user, "餐饮");

    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件"));
  });
});
