// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, addTag, setBlockChecked, setBlockLayer, setBlockTag, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { daysFromOct1, openStoredPlan, showView, stubNarrowScreen } from "./test-helpers";

afterEach(async () => {
  cleanup();
  vi.unstubAllGlobals();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, input: AddBlockInput): string {
  const result = addBlock(plan, library, input);
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function tag(library: Y.Doc, name: string): string {
  const result = addTag(library, { name, color: "#c08d68" });
  if (!result.ok) throw new Error("建标签失败");
  return result.value.tagId;
}

interface Seed {
  /** 「西湖」挂不挂「必去」 */
  lakeTagged?: boolean;
  /** 没排时间的「河坊街」挂不挂「必去」 */
  streetTagged?: boolean;
  /** 「西湖」划没划掉 */
  lakeStruck?: boolean;
}

/** 10.1：「西湖」09:00 起 3 小时挂着 300 元、「看潮」12:00 起 30 分钟、没排时间的「河坊街」、整天的「在杭州」（停留）。 */
async function oneDay(seed: Seed = {}): Promise<string> {
  return openStoredPlan((plan, library) => {
    const [day] = daysFromOct1(plan, 1);
    const must = tag(library, "必去");
    const lake = block(plan, library, { baseId: day!, kindId: "sight", title: "西湖", minute: 540, duration: 180 });
    addExpense(plan, library, { title: "门票", amountCents: 30000, blockIds: [lake] });
    block(plan, library, { baseId: day!, kindId: "sight", title: "看潮", minute: 720, duration: 30 });
    const street = block(plan, library, { baseId: day!, kindId: "shopping", title: "河坊街", slot: "day" });
    block(plan, library, { baseId: day!, kindId: "stay", title: "在杭州", minute: 0, duration: 1440 });
    if (seed.lakeTagged) setBlockTag(plan, library, [lake], must, true);
    if (seed.streetTagged) setBlockTag(plan, library, [street], must, true);
    if (seed.lakeStruck) setBlockChecked(plan, [lake], true);
  });
}

/** 时间线上读屏名以「title 」开头的那一段的外框。 */
async function segmentOf(title: string): Promise<HTMLElement> {
  const timeline = await screen.findByRole("region", { name: "时间线" });
  return within(timeline)
    .getByRole("button", { name: new RegExp(`^${title} `) })
    .closest<HTMLElement>("[data-segment]")!;
}

/** 横轴那一层的最小高度：背景细条 16 + 主轨每一道。 */
function axisHeight(): string {
  return document.querySelector<HTMLElement>("[data-timeline-axis]")!.style.minHeight;
}

async function toggle(user: User, label: "标题" | "时长" | "开销"): Promise<void> {
  await user.click(within(screen.getByRole("group", { name: "块上写" })).getByRole("button", { name: label }));
}

function linesSlider(): HTMLInputElement {
  return screen.getByRole("slider", { name: "文字行数" }) as HTMLInputElement;
}

function titleLines(segment: HTMLElement): string {
  return segment.style.getPropertyValue("--title-lines");
}

describe("书签栏：上面那一区", () => {
  it("有排上时间的事挂着标签：每道 38，书签挂在书签栏里", async () => {
    await oneDay({ lakeTagged: true });
    await showView("时间线");

    const lake = await segmentOf("西湖");
    expect(axisHeight()).toBe("54px"); // 背景细条 16 + 一道 38
    expect(lake.dataset.tagBar).toBe("true");
    expect(lake.querySelectorAll("[data-tag-ribbon]")).toHaveLength(1);
    // 没挂标签的也留着书签栏：同一行的标题对得齐
    expect((await segmentOf("看潮")).dataset.tagBar).toBe("true");
  });

  it("只有没排时间的事挂着标签：时间线上没有书签栏", async () => {
    await oneDay({ streetTagged: true });
    await showView("时间线");

    expect(axisHeight()).toBe("44px");
    expect((await segmentOf("西湖")).dataset.tagBar).toBeUndefined();
  });

  it("挂着标签的事被筛掉了：书签栏还在，点筛选时版面不跳", async () => {
    const user = userEvent.setup();
    await oneDay({ lakeTagged: true, lakeStruck: true });
    await showView("时间线");

    await user.click(await screen.findByRole("button", { name: "只看没划掉的" }));

    const timeline = await screen.findByRole("region", { name: "时间线" });
    await waitFor(() => expect(within(timeline).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect((await segmentOf("看潮")).dataset.tagBar).toBe("true");
    expect(axisHeight()).toBe("54px");
  });
});

describe("附件栏：下面那一区", () => {
  it("时长和开销在最下面一行，开销在最右；每道 40", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await toggle(user, "时长");
    await toggle(user, "开销");

    const lake = await waitFor(async () => {
      const segment = await segmentOf("西湖");
      expect(segment.querySelector("[data-bar-foot]")).not.toBeNull();
      return segment;
    });
    const foot = lake.querySelector<HTMLElement>("[data-bar-foot]")!;
    // 在按钮外面（开销能点，按钮里不能再放按钮）
    expect(foot.parentElement).toBe(lake);
    // 从右往左排：先开销（最右）、再时长；两样放不下时时长整个换到看不见的下一行，不留半截
    const parts = [...foot.children].map((child) =>
      child.hasAttribute("data-bar-duration") ? "时长" : child.hasAttribute("data-bar-money") ? "开销" : "?",
    );
    expect(parts).toEqual(["开销", "时长"]);
    expect(foot.textContent).toBe("¥3003 小时");
    expect(lake.dataset.foot).toBe("true");
    expect(axisHeight()).toBe("56px");
  });

  it("书签栏、标题、附件栏都有：每道 50", async () => {
    const user = userEvent.setup();
    await oneDay({ lakeTagged: true });
    await showView("时间线");

    await toggle(user, "开销");

    await waitFor(() => expect(axisHeight()).toBe("66px"));
    expect((await segmentOf("西湖")).style.height).toBe("46px");
  });

  it("只开时长：时长在最下面一行，每道 28", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await toggle(user, "时长");
    await toggle(user, "标题");

    const lake = await waitFor(async () => {
      const segment = await segmentOf("西湖");
      expect(segment.querySelector("[data-bar-title]")).toBeNull();
      return segment;
    });
    expect(lake.querySelector("[data-bar-foot] [data-bar-duration]")?.textContent).toBe("3 小时");
    expect(axisHeight()).toBe("44px");
  });
});

describe("中间那一区写几行：文字行数拉动条", () => {
  it("默认 1 行；拉到 3 行，每道 60，标题最多写 3 行", async () => {
    await oneDay();
    await showView("时间线");

    const slider = linesSlider();
    expect([slider.value, slider.min, slider.max, slider.step]).toEqual(["1", "1", "4", "1"]);
    expect(screen.getByText("1 行")).toBeTruthy();
    expect(titleLines(await segmentOf("西湖"))).toBe("1");

    fireEvent.change(slider, { target: { value: "3" } });

    await waitFor(() => expect(screen.getByText("3 行")).toBeTruthy());
    expect(axisHeight()).toBe("76px"); // 背景细条 16 + 一道 60
    expect(titleLines(await segmentOf("西湖"))).toBe("3");
    expect(linesSlider().getAttribute("aria-valuetext")).toBe("3 行");
  });

  it("记在这台设备上：切走再回来还是那个行数；另一个计划是 1 行", async () => {
    const planId = await oneDay();
    await showView("时间线");

    fireEvent.change(linesSlider(), { target: { value: "2" } });
    await showView("日程");
    await showView("时间线");
    await waitFor(() => expect(linesSlider().value).toBe("2"));

    expect(localStorage.getItem(`welshonion.title-lines.${planId}`)).toBe("2");
    cleanup();
    await releaseAll();
    await oneDay();
    await showView("时间线");
    expect(linesSlider().value).toBe("1");
  });

  it("关掉「标题」时按不了", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await toggle(user, "标题");

    await waitFor(() => expect(linesSlider().disabled).toBe(true));
    expect(linesSlider().title).toBe("关着「标题」时块上不写字");
  });

  it("细条不受行数影响", async () => {
    await oneDay();
    await showView("时间线");

    fireEvent.change(linesSlider(), { target: { value: "4" } });

    await waitFor(async () => expect(titleLines(await segmentOf("西湖"))).toBe("4"));
    expect(titleLines(await segmentOf("在杭州"))).toBe("");
  });

  it("手机上没有拉动条", async () => {
    stubNarrowScreen();
    await oneDay();
    await showView("时间线");

    await screen.findByRole("region", { name: "时间线" });
    expect(screen.queryByRole("slider", { name: "文字行数" })).toBeNull();
  });
});

describe("套在里面的块往下让「书签栏 + 标题那几行」", () => {
  it("有书签栏、2 行字：往下让 44 像素", async () => {
    await openStoredPlan((plan, library) => {
      const [day] = daysFromOct1(plan, 1);
      const must = tag(library, "必去");
      const outer = block(plan, library, { baseId: day!, kindId: "sight", title: "横店", minute: 480, duration: 720 });
      const inner = block(plan, library, { baseId: day!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      setBlockLayer(plan, library, inner, outer);
      setBlockTag(plan, library, [outer], must, true);
    });
    await showView("时间线");
    fireEvent.change(linesSlider(), { target: { value: "2" } });

    await waitFor(async () => expect(titleLines(await segmentOf("横店"))).toBe("2"));
    const outerTop = Number.parseFloat((await segmentOf("横店")).style.top);
    const innerTop = Number.parseFloat((await segmentOf("明清宫苑")).style.top);
    expect(innerTop - outerTop).toBe(44);
  });
});

describe("手机上的竖条按自己的高度分区", () => {
  it("3 小时的竖条书签栏、附件栏都有，中间写满；半小时的只写标题", async () => {
    stubNarrowScreen();
    const user = userEvent.setup();
    await oneDay({ lakeTagged: true });
    await showView("时间线");

    await toggle(user, "时长");
    await toggle(user, "开销");

    const lake = await waitFor(async () => {
      const segment = await segmentOf("西湖");
      expect(segment.dataset.foot).toBe("true");
      return segment;
    });
    expect(lake.dataset.tagBar).toBe("true");
    expect(titleLines(lake)).toBe("7");
    expect(lake.querySelectorAll("[data-tag-ribbon]")).toHaveLength(1);
    expect(lake.querySelector("[data-bar-foot]")?.textContent).toBe("¥3003 小时");

    const tide = await segmentOf("看潮");
    expect([tide.dataset.tagBar, tide.dataset.foot, titleLines(tide)]).toEqual([undefined, undefined, "1"]);
  });
});
