// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setPlanSettings, updateBlock, type BlockView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTexts, dayRow, daysFromOct1, openOtherTab, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;
type OtherTab = Awaited<ReturnType<typeof openOtherTab>>;

function undated(plan: Y.Doc, library: Y.Doc, title: string, kindId = "sight"): string {
  const [oct1] = daysFromOct1(plan, 1);
  const result = addBlock(plan, library, { baseId: oct1!, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1 上 08:00 起 1 小时的「去西湖」（交通）；给了 meters 就是自驾这么远。 */
function driveToLake(plan: Y.Doc, library: Y.Doc, meters?: number): void {
  const [oct1] = daysFromOct1(plan, 1);
  const result = addBlock(plan, library, { baseId: oct1!, kindId: "transit", title: "去西湖", minute: 480, duration: 60 });
  if (!result.ok) throw new Error("建块失败");
  if (meters !== undefined) updateBlock(plan, library, result.value.blockId, { transport_mode: "drive", distance_m: meters });
}

async function openDetails(user: User, title: string): Promise<HTMLElement> {
  await user.click(within(await blockRow("10.1", title)).getByRole("button", { name: "这件事的操作" }));
  await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "详情…" }));
  return screen.getByRole("group", { name: `${title} 的详情` });
}

async function subtitleOf(title: string): Promise<string | null> {
  return (await blockRow("10.1", title)).querySelector("[data-block-subtitle]")?.textContent ?? null;
}

function blockOf(other: OtherTab, title: string): BlockView | undefined {
  return [...other.plan().blocks.values()].find((block) => block.title === title);
}

describe("块的详情", () => {
  it("填短备注：标题下面写着；打开时焦点在短备注", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      undated(plan, library, "西湖");
    });
    const other = await openOtherTab(planId);

    const details = await openDetails(user, "西湖");
    const subtitle = within(details).getByLabelText("短备注");
    expect(document.activeElement).toBe(subtitle);
    await user.type(subtitle, "看落日{Enter}");

    await waitFor(async () => expect(await subtitleOf("西湖")).toBe("看落日"));
    await waitFor(() => expect(blockOf(other, "西湖")?.subtitle).toBe("看落日"));
  });

  it("清空短备注：标题下面没有小字", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      updateBlock(plan, library, undated(plan, library, "西湖"), { subtitle: "看落日" });
    });
    expect(await subtitleOf("西湖")).toBe("看落日");

    const details = await openDetails(user, "西湖");
    await user.clear(within(details).getByLabelText("短备注"));
    await user.keyboard("{Enter}");
    await waitFor(async () => expect(await subtitleOf("西湖")).toBeNull());
  });

  it("长备注：回车换行，离开时保存；标题下面写「有长备注」", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => {
      undated(plan, library, "西湖");
    });
    const other = await openOtherTab(planId);

    const details = await openDetails(user, "西湖");
    await user.type(within(details).getByLabelText("长备注"), "北山街停车{Enter}傍晚去断桥");
    await user.click(within(details).getByRole("button", { name: "收起" }));

    await waitFor(() => expect(blockOf(other, "西湖")?.note).toBe("北山街停车\n傍晚去断桥"));
    expect(await subtitleOf("西湖")).toBe("有长备注");
    expect(screen.queryByRole("group", { name: "西湖 的详情" })).toBeNull();
  });

  it("Esc 收起：焦点回到这一行的行菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      undated(plan, library, "西湖");
    });

    await openDetails(user, "西湖");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("group", { name: "西湖 的详情" })).toBeNull();
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }),
      ),
    );
  });
});

describe("路程", () => {
  it("交通块填自驾和距离：这天怎么样跟着出现", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => driveToLake(plan, library));
    const other = await openOtherTab(planId);

    const details = await openDetails(user, "去西湖");
    await user.selectOptions(within(details).getByLabelText("交通方式"), "drive");
    await user.type(within(details).getByLabelText("距离（公里）"), "32{Enter}");

    await waitFor(() => expect(blockOf(other, "去西湖")).toMatchObject({ transport_mode: "drive", distance_m: 32000 }));
    await waitFor(async () =>
      expect((await dayRow("10.1")).querySelector("[data-day-facts]")?.textContent).toBe(
        "08:00 起 · 09:00 收工 · 自驾 1 小时 32 公里",
      ),
    );
  });

  it("别的块点了「加路程」才有两栏", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      undated(plan, library, "西湖");
    });

    const details = await openDetails(user, "西湖");
    expect(within(details).queryByLabelText("交通方式")).toBeNull();
    await user.click(within(details).getByRole("button", { name: "加路程" }));
    expect(within(details).getByLabelText("交通方式")).toBeTruthy();
    expect(within(details).getByLabelText("距离（公里）")).toBeTruthy();
    expect(within(details).queryByRole("button", { name: "加路程" })).toBeNull();
  });

  it("距离填错：栏下说明，不保存", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => driveToLake(plan, library, 32000));
    const other = await openOtherTab(planId);

    const details = await openDetails(user, "去西湖");
    const distance = within(details).getByLabelText("距离（公里）") as HTMLInputElement;
    expect(distance.value).toBe("32");
    await user.clear(distance);
    await user.type(distance, "32.55{Enter}");
    expect(await within(details).findByText("要填不小于 0 的数，最多一位小数")).toBeTruthy();
    expect(blockOf(other, "去西湖")?.distance_m).toBe(32000);
  });

  it("不是交通：交通方式清掉，距离还在", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan((plan, library) => driveToLake(plan, library, 32000));
    const other = await openOtherTab(planId);

    const details = await openDetails(user, "去西湖");
    await user.selectOptions(within(details).getByLabelText("交通方式"), "");
    await waitFor(() => expect(blockOf(other, "去西湖")?.transport_mode).toBeNull());
    expect(blockOf(other, "去西湖")?.distance_m).toBe(32000);
  });
});

describe("自驾自动挂油费", () => {
  it("填齐就挂上", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      setPlanSettings(plan, { cost_per_km_cents: 80 });
      undated(plan, library, "去乌镇", "transit");
    });

    const details = await openDetails(user, "去乌镇");
    await user.selectOptions(within(details).getByLabelText("交通方式"), "drive");
    await user.type(within(details).getByLabelText("距离（公里）"), "132{Enter}");
    await waitFor(async () =>
      expect((await blockRow("10.1", "去乌镇")).querySelector("[data-money-cell]")?.textContent).toBe("¥105.60"),
    );
  });
});

describe("没排时间的块只存时长", () => {
  it("只存时长：时间格和这天怎么样跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      undated(plan, library, "灵隐寺");
    });

    await user.click(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "时间" }));
    const editor = screen.getByRole("group", { name: "灵隐寺 的时间" });
    const hours = within(editor).getByRole("spinbutton", { name: "小时" });
    await user.clear(hours);
    await user.type(hours, "2");
    const minutes = within(editor).getByRole("spinbutton", { name: "分钟" });
    await user.clear(minutes);
    await user.type(minutes, "0");
    await user.click(within(editor).getByRole("button", { name: "只存时长" }));

    await waitFor(async () => expect(await blockTexts("10.1")).toEqual([{ title: "灵隐寺", time: "整天 · 2 小时" }]));
    expect((await dayRow("10.1")).querySelector("[data-day-facts]")?.textContent).toBe("还有 2 小时没排");
  });

  it("没排时间但填了时长的时间格", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day", duration: 120 });
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "河坊街", slot: "afternoon" });
    });

    expect(await blockTexts("10.1")).toEqual([
      { title: "灵隐寺", time: "整天 · 2 小时" },
      { title: "河坊街", time: "下午" },
    ]);
  });
});
