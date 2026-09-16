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

/** 这一段上写着标题的那一小段（没写是 null）。 */
function titleText(segment: HTMLElement): HTMLElement | null {
  return segment.querySelector<HTMLElement>("[data-bar-title]");
}

/** 这一段上写着时长的那一小段（没写是 null）。 */
function durationText(segment: HTMLElement): HTMLElement | null {
  return segment.querySelector<HTMLElement>("[data-bar-duration]");
}

/** 横轴那一层的最小高度：背景细条 16 + 主轨每道 28（或写开销时 40）。 */
function axisHeight(): string {
  return document.querySelector<HTMLElement>("[data-timeline-axis]")!.style.minHeight;
}

/** 点一下视图那一行右边的「标题」或「开销」开关。 */
async function toggle(user: ReturnType<typeof userEvent.setup>, label: "标题" | "时长" | "开销"): Promise<void> {
  await user.click(within(screen.getByRole("group", { name: "块上写" })).getByRole("button", { name: label }));
}

function pressed(label: "标题" | "时长" | "开销"): string | null {
  return within(screen.getByRole("group", { name: "块上写" }))
    .getByRole("button", { name: label })
    .getAttribute("aria-pressed");
}

describe("块上写标题、开销：两个开关各开各关", () => {
  it("默认只开标题：块上只有标题，主轨一道 28 像素", async () => {
    await dayWithMoney();

    expect(pressed("标题")).toBe("true");
    expect(pressed("时长")).toBe("false");
    expect(pressed("开销")).toBe("false");
    expect(titleText(await segmentOf("西湖"))?.textContent).toBe("西湖");
    expect(durationText(await segmentOf("西湖"))).toBeNull();
    expect(moneyLine(await segmentOf("西湖"))).toBeNull();
    expect(axisHeight()).toBe("44px"); // 背景细条 16 + 一道 28
  });

  it("两个都开：上标题下开销，一道变 40 像素", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
    expect(titleText(await segmentOf("西湖"))?.textContent).toBe("西湖");
    expect(axisHeight()).toBe("56px"); // 背景细条 16 + 一道 40
    expect((await segmentOf("西湖")).style.height).toBe("36px");
  });

  it("只开开销：块上只有金额，一道回到 28 像素", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "开销");
    await toggle(user, "标题");

    await waitFor(async () => expect(titleText(await segmentOf("西湖"))).toBeNull());
    expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300");
    expect(axisHeight()).toBe("44px");
  });

  it("两个都关：块上不写字，块还在", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "标题");

    await waitFor(async () => expect(titleText(await segmentOf("西湖"))).toBeNull());
    expect(moneyLine(await segmentOf("西湖"))).toBeNull();
    expect(pressed("标题")).toBe("false");
    expect(pressed("开销")).toBe("false");
    expect(axisHeight()).toBe("44px");
    expect((await segmentOf("西湖")).dataset).toMatchObject({ from: "540", to: "720" });
  });

  it("开「时长」：块上标题右边写时长，一道还是 28 像素", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "时长");

    await waitFor(async () => expect(durationText(await segmentOf("西湖"))?.textContent).toBe("3 小时"));
    expect(titleText(await segmentOf("西湖"))?.textContent).toBe("西湖");
    expect(axisHeight()).toBe("44px");
  });

  it("时长和开销一起：第一行标题加时长，第二行开销，一道 40 像素", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "时长");
    await toggle(user, "开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
    expect(durationText(await segmentOf("西湖"))?.textContent).toBe("3 小时");
    expect(axisHeight()).toBe("56px");
  });

  it("只开时长：块上只有时长", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "时长");
    await toggle(user, "标题");

    await waitFor(async () => expect(titleText(await segmentOf("西湖"))).toBeNull());
    expect(durationText(await segmentOf("西湖"))?.textContent).toBe("3 小时");
    expect(axisHeight()).toBe("44px");
  });

  it("不到一小时写分钟；细条不写时长", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      block(plan, library, { baseId: day!, kindId: "sight", title: "看潮", minute: 720, duration: 45 });
      block(plan, library, { baseId: day!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
    });
    await showView("时间轴");

    await toggle(user, "时长");

    await waitFor(async () => expect(durationText(await segmentOf("看潮"))?.textContent).toBe("45 分钟"));
    expect(durationText(await segmentOf("在杭州"))).toBeNull();
  });

  it("没挂开销的写淡色的「填开销」；垫在下面的细条不写开销", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "开销");

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

    await toggle(user, "开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("午饭"))?.textContent).toBe("¥158.50 · 2 笔"));
  });

  it("点块上的开销：选中这件事，就地改金额", async () => {
    const user = userEvent.setup();
    await dayWithMoney();
    await toggle(user, "开销");

    await user.click(await waitFor(async () => moneyLine(await segmentOf("西湖"))!));

    expect((await segmentOf("西湖")).querySelector("button")!.getAttribute("aria-pressed")).toBe("true");
    const amount = screen.getByRole("textbox", { name: "金额" });
    await user.clear(amount);
    await user.type(amount, "280{Enter}");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥280"));
    expect((await moneyOverview()).textContent).toContain("总额 ¥280");
  });

  it("记在这台设备上：切走再回来还是那两个开关，另一个计划回到默认", async () => {
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "开销");
    await toggle(user, "标题");
    await showView("列表");
    await showView("时间轴");

    await waitFor(() => expect(pressed("开销")).toBe("true"));
    expect(pressed("标题")).toBe("false");
    expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300");

    // 另一个计划：还是只开标题
    cleanup();
    await dayWithMoney();
    expect(pressed("标题")).toBe("true");
    expect(pressed("开销")).toBe("false");
  });

  it("手机上竖条里标题下面写开销", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await dayWithMoney();

    await toggle(user, "开销");

    await waitFor(async () => expect(moneyLine(await segmentOf("西湖"))?.textContent).toBe("¥300"));
    expect(titleText(await segmentOf("西湖"))?.textContent).toContain("西湖");
  });
});
