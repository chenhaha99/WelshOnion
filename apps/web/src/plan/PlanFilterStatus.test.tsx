// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, addStatus, setBlockStatus } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTitles, dayRow, daysFromOct1, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function undated(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, statusId = "pending"): string {
  const result = addBlock(plan, library, { baseId, kindId: "sight", title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  if (statusId !== "pending") setBlockStatus(plan, library, [result.value.blockId], statusId);
  return result.value.blockId;
}

function timed(
  plan: Y.Doc,
  library: Y.Doc,
  baseId: string,
  title: string,
  kindId: string,
  minute: number,
  duration: number,
  statusId: string,
): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  if (statusId !== "pending") setBlockStatus(plan, library, [result.value.blockId], statusId);
  return result.value.blockId;
}

function money(plan: Y.Doc, library: Y.Doc, cents: number, blockIds: string[]): void {
  const result = addExpense(plan, library, { title: "钱", amountCents: cents, blockIds });
  if (!result.ok) throw new Error("建钱失败");
}

/** 10.1：「西湖」（待定）、「午饭」（已确认）、「灵隐寺」（待定），都没排时间。 */
function threeThings(plan: Y.Doc, library: Y.Doc): string {
  const [oct1] = daysFromOct1(plan, 1);
  undated(plan, library, oct1!, "西湖");
  undated(plan, library, oct1!, "午饭", "confirmed");
  undated(plan, library, oct1!, "灵隐寺");
  return oct1!;
}

function filterGroup(): HTMLElement {
  return screen.getByRole("group", { name: "按状态筛选" });
}

async function pressStatus(user: User, name: string): Promise<void> {
  await screen.findByRole("group", { name: "按状态筛选" });
  await user.click(within(filterGroup()).getByRole("button", { name }));
}

async function filteredOutOf(day: string): Promise<string | null> {
  return (await dayRow(day)).querySelector("[data-filtered-out]")?.textContent ?? null;
}

describe("按状态筛选", () => {
  it("一件事都没有时没有「只看」那一排；加了第一件事就出现", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 1));
    await screen.findByRole("region", { name: "时间轴" });
    expect(screen.queryByRole("group", { name: "按状态筛选" })).toBeNull();

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "西湖{Enter}");

    expect(await screen.findByRole("group", { name: "按状态筛选" })).toBeTruthy();
  });

  it("按下了状态、事都删了：这一排还在，按下的还是按下的", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "西湖");
    });
    await pressStatus(user, "待定");

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    expect(within(filterGroup()).getByRole("button", { name: "待定" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("只看待定的", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressStatus(user, "待定");
    expect(within(filterGroup()).getByRole("button", { name: "待定" }).getAttribute("aria-pressed")).toBe("true");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 1 件");
  });

  it("同时看两个状态，含自建状态", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const oct1 = threeThings(plan, library);
      const booked = addStatus(library, { name: "已预订", color: "#6b8fb0" });
      if (!booked.ok) throw new Error("建状态失败");
      undated(plan, library, oct1, "酒店", booked.value.statusId);
    });

    await pressStatus(user, "已确认");
    await pressStatus(user, "已预订");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["午饭", "酒店"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
  });

  it("全部显示：一键取消", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressStatus(user, "待定");
    await user.click(within(filterGroup()).getByRole("button", { name: "全部显示" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "午饭", "灵隐寺"]));
    expect(await filteredOutOf("10.1")).toBeNull();
    expect(within(filterGroup()).queryByRole("button", { name: "全部显示" })).toBeNull();
    expect(within(filterGroup()).getByRole("button", { name: "待定" }).getAttribute("aria-pressed")).toBe("false");
  });
});

describe("筛选作用到钱、占比和这天怎么样", () => {
  it("钱的总览：挂在被筛掉的块上的钱不算，不属于任何一天不变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      money(plan, library, 30000, [undated(plan, library, oct1!, "西湖")]);
      money(plan, library, 12000, [undated(plan, library, oct1!, "午饭", "confirmed")]);
      money(plan, library, 60000, []);
    });

    await pressStatus(user, "已确认");
    const overview = screen.getByRole("region", { name: "钱的总览" });
    await waitFor(() =>
      expect(overview.querySelector("[data-money-summary]")?.textContent).toBe("总额 ¥720 · 人均 ¥720 · 已填 2 / 共 2 笔"),
    );
    expect(within(overview).getByRole("button", { name: "不属于任何一天：¥600" })).toBeTruthy();
  });

  it("共用的钱显示在通过筛选的块上", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1, oct2] = daysFromOct1(plan, 2);
      const first = undated(plan, library, oct1!, "民宿");
      const second = undated(plan, library, oct2!, "民宿", "confirmed");
      money(plan, library, 50000, [first, second]);
    });

    await pressStatus(user, "已确认");
    await waitFor(async () =>
      expect((await blockRow("10.2", "民宿")).querySelector("[data-money-cell]")?.textContent).toBe("¥500"),
    );
  });

  it("占比和这天怎么样", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      timed(plan, library, oct1!, "西湖", "sight", 540, 180, "pending");
      timed(plan, library, oct1!, "晚饭", "food", 1080, 60, "confirmed");
    });

    await pressStatus(user, "已确认");
    await waitFor(async () =>
      expect((await dayRow("10.1")).querySelector("[data-day-facts]")?.textContent).toBe("18:00 起 · 19:00 收工"),
    );
    const card = screen.getByRole("region", { name: "占比" });
    const time = within(card).getByRole("group", { name: "时间的占比" });
    expect(within(time).getAllByRole("listitem").map((item) => item.textContent)).toEqual(["餐饮 1 小时 · 100%"]);
    expect(within(within(card).getByRole("group", { name: "定没定" })).getByText("1 件事：已确认 1")).toBeTruthy();
  });
});

describe("筛选开着时改块", () => {
  async function chooseStatus(user: User, title: string, status: string): Promise<void> {
    await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: /^状态：/ }));
    await user.click(within(screen.getByRole("dialog", { name: "选择状态" })).getByRole("button", { name: status }));
  }

  it("挨个确认：这一行被筛掉，焦点落到下一行的状态按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressStatus(user, "待定");
    await chooseStatus(user, "西湖", "已确认");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 2 件");
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "状态：待定" }),
      ),
    );
  });

  it("最后一件也确认了：焦点落到这天的菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);

    await pressStatus(user, "待定");
    await chooseStatus(user, "西湖", "已确认");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await chooseStatus(user, "灵隐寺", "已确认");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    expect(await filteredOutOf("10.1")).toBe("筛掉了 3 件");
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("button", { name: "这天的操作" })),
    );
  });

  it("加的块被筛掉：建好了但不显示，写「包括刚加的」，焦点还在「加一件事」", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(threeThings);
    const other = await openOtherTab(planId);

    await pressStatus(user, "已确认");
    const add = within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" });
    await user.type(add, "河坊街{Enter}");

    await waitFor(() =>
      expect([...other.plan().blocks.values()].find((block) => block.title === "河坊街")?.status.id).toBe("pending"),
    );
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 3 件，包括刚加的「河坊街」"));
    expect(await blockTitles("10.1")).toEqual(["午饭"]);
    expect(document.activeElement).toBe(add);
  });

  it("筛选变了就不再写「包括刚加的」", async () => {
    const user = userEvent.setup();
    await openStoredPlan(threeThings);
    await pressStatus(user, "已确认");
    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "河坊街{Enter}");
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 3 件，包括刚加的「河坊街」"));

    await user.click(within(filterGroup()).getByRole("button", { name: "全部显示" }));
    await waitFor(async () => expect(await filteredOutOf("10.1")).toBeNull());
    await pressStatus(user, "已确认");

    await waitFor(async () => expect(await filteredOutOf("10.1")).toBe("筛掉了 3 件"));
  });
});

describe("删除块", () => {
  it("删完焦点落到下一行的行菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "西湖");
      undated(plan, library, oct1!, "灵隐寺");
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "这件事的操作" }),
      ),
    );
  });

  it("删掉最后一行：焦点落到这天的菜单按钮，Ctrl+Z 能撤销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "西湖");
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("button", { name: "这天的操作" })),
    );
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
  });
});
