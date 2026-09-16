// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, moneyOverview, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

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

/** 10.1：「西湖」09:00 起 3 小时挂着 300 元、「灵隐寺」14:00 起 2 小时没挂开销、「在杭州」（停留）整天。 */
async function dayWithMoney(): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [day] = daysFromOct1(plan, 1);
    const lake = block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    addExpense(plan, library, { title: "门票", amountCents: 30000, blockIds: [lake] });
    block(plan, library, { baseId: day!, kindId: "sight", title: "灵隐寺", minute: 840, duration: 120 });
    block(plan, library, { baseId: day!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
  });
  await showView("时间轴");
}

/** 时间轴上读屏名以「title 」开头的那一段的外框。 */
async function segmentOf(title: string): Promise<HTMLElement> {
  const timeline = await screen.findByRole("region", { name: "时间轴" });
  return within(timeline)
    .getByRole("button", { name: new RegExp(`^${title} `) })
    .closest<HTMLElement>("[data-segment]")!;
}

/** 这一段上写着开销的那一行（没写是 null）。 */
function moneyLine(segment: HTMLElement): HTMLElement | null {
  return segment.querySelector<HTMLElement>("[data-bar-money] button, [data-bar-money-text]");
}

async function pressBlockText(user: ReturnType<typeof userEvent.setup>, label: string): Promise<void> {
  await user.click(within(screen.getByRole("group", { name: "块上写" })).getByRole("button", { name: label }));
}

describe("块上写标题，还是标题加开销", () => {
  it("默认只写标题；开了以后横条上多写一行开销，这一行的道变高", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    expect(moneyLine(await segmentOf("西湖"))).toBeNull();
    const axis = document.querySelector<HTMLElement>("[data-timeline-axis]")!;
    expect(axis.style.minHeight).toBe("44px"); // 背景细条 16 + 一道 28

    await pressBlockText(user, "标题 + 开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
    expect(axis.style.minHeight).toBe("56px"); // 背景细条 16 + 一道 40
    expect((await segmentOf("西湖")).style.height).toBe("36px");
  });

  it("没挂开销的写淡色的「填开销」；垫在下面的细条不写开销", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await pressBlockText(user, "标题 + 开销");

    const empty = await waitFor(async () => moneyLine(await segmentOf("灵隐寺"))!);
    expect(empty.textContent).toBe("填开销");
    expect(empty.className).toContain("timeline-money-empty");
    expect(moneyLine(await segmentOf("在杭州"))).toBeNull();
  });

  it("挂着两笔写合计和笔数", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      const lunch = block(plan, library, { baseId: day!, kindId: "food", title: "午饭", minute: 720, duration: 60 });
      addExpense(plan, library, { title: "面", amountCents: 12000, blockIds: [lunch] });
      addExpense(plan, library, { title: "汤", amountCents: 3850, blockIds: [lunch] });
    });
    await showView("时间轴");

    await pressBlockText(user, "标题 + 开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("午饭"))?.textContent).toBe("¥158.50 · 2 笔"));
  });

  it("点块上的开销：选中这件事，就地改金额", async () => {
    const user = userEvent.setup();
    await dayWithMoney();
    await pressBlockText(user, "标题 + 开销");

    await user.click(await waitFor(async () => moneyLine(await segmentOf("西湖"))!));

    expect((await segmentOf("西湖")).querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    const amount = screen.getByRole("textbox", { name: "金额" });
    await user.clear(amount);
    await user.type(amount, "280{Enter}");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥280"));
    expect((await moneyOverview()).textContent).toContain("总额 ¥280");
  });

  it("选的记在这台设备上：切走再回来还是它，另一个计划还是只写标题", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await pressBlockText(user, "标题 + 开销");
    await showView("列表");
    await showView("时间轴");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
    const group = screen.getByRole("group", { name: "块上写" });
    expect(within(group).getByRole("button", { name: "标题 + 开销" }).getAttribute("aria-pressed")).toBe("true");

    // 另一个计划：还是只写标题
    cleanup();
    await dayWithMoney();
    expect(moneyLine(await segmentOf("西湖"))).toBeNull();
  });

  it("手机上竖条里标题下面写开销", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await dayWithMoney();

    await pressBlockText(user, "标题 + 开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
  });
});
