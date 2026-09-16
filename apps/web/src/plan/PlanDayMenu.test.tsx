// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, readLibrary, readPlan } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { NOW } from "../app/test-render";
import { openLibrary } from "../storage/library";
import { openPlan } from "../storage/plans";
import { releaseAll, track } from "../storage/test-helpers";
import { dayLabels, dayRow, daysFromOct1, openDayMenu, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

describe("每天的菜单", () => {
  it("在下面插一天：后面的天往后顺延", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "在下面插一天" }));
    await waitFor(async () => expect(await dayLabels()).toHaveLength(4));
    expect(await dayLabels()).toEqual([
      "第 1 天 · 10.1 周四",
      "第 2 天 · 10.2 周五",
      "第 3 天 · 10.3 周六",
      "第 4 天 · 10.4 周日",
    ]);
  });

  it("删除这天：其他天的日期不变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await user.click(within(await openDayMenu(user, "10.2")).getByRole("menuitem", { name: "删除这天" }));
    await waitFor(async () => expect(await dayLabels()).toEqual(["第 1 天 · 10.1 周四", "第 2 天 · 10.3 周六"]));
  });

  it("下移：这天的事跟着那天走", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 3);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 60 });
    });

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "下移" }));
    await waitFor(async () => expect(within(await dayRow("10.2")).queryByDisplayValue("西湖")).toBeTruthy());
    expect(within(await dayRow("10.1")).queryByDisplayValue("西湖")).toBeNull();
  });

  it("改这天的时区", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await user.click(within(await openDayMenu(user, "10.3")).getByRole("menuitem", { name: "改时区…" }));
    await user.selectOptions(within(await dayRow("10.3")).getByRole("combobox", { name: "时区" }), "Asia/Tokyo");
    await waitFor(async () =>
      expect(await dayLabels()).toEqual([
        "第 1 天 · 10.1 周四 · 北京",
        "第 2 天 · 10.2 周五 · 北京",
        "第 3 天 · 10.3 周六 · 东京 +1h",
      ]),
    );
  });

  it("加一个另一时区的这天", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    await user.click(
      within(await openDayMenu(user, "10.2")).getByRole("menuitem", { name: "加一个另一时区的这天…" }),
    );
    await user.selectOptions(within(await dayRow("10.2")).getByRole("combobox", { name: "时区" }), "Asia/Tokyo");
    await waitFor(async () =>
      expect(await dayLabels()).toEqual([
        "第 1 天 · 10.1 周四 · 北京",
        "第 2 天 · 10.2 周五 · 北京",
        "第 2 天 · 10.2 周五 · 东京 +1h",
      ]),
    );
  });

  it("Esc 关菜单，焦点回到菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan) => daysFromOct1(plan, 3));

    await openDayMenu(user, "10.1");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("button", { name: "这天的操作" }));
  });
});

describe("插天时被块跨过先问", () => {
  /** 10.1 22:00 开始、4 小时的住宿，跨过 10.1 和 10.2 的交界。 */
  function crossingLodging(plan: import("yjs").Doc, library: import("yjs").Doc): void {
    const [oct1] = daysFromOct1(plan, 2);
    addBlock(plan, library, {
      baseId: oct1!,
      kindId: "lodging",
      title: "酒店",
      minute: 22 * 60,
      duration: 240,
    });
  }

  it("选放到之后：块挪到新插入的那天", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(crossingLodging);

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "在下面插一天" }));
    await user.click(within(await dayRow("10.1")).getByRole("button", { name: "之后" }));
    await waitFor(async () => expect(await dayLabels()).toHaveLength(3));

    const otherTab = track(await openLibrary());
    const plan = track(await openPlan(otherTab.doc, planId, NOW));
    const view = readPlan(plan.doc, readLibrary(otherTab.doc));
    const lodging = [...view.blocks.values()].find((block) => block.title === "酒店")!;
    expect(view.bases.find((base) => base.id === lodging.start_base_id)?.date).toBe("2026-10-02");
  });

  it("取消不插", async () => {
    const user = userEvent.setup();
    await openStoredPlan(crossingLodging);

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "在下面插一天" }));
    await user.click(within(await dayRow("10.1")).getByRole("button", { name: "取消" }));
    expect(within(await dayRow("10.1")).queryByRole("button", { name: "之后" })).toBeNull();
    expect(await dayLabels()).toHaveLength(2);
  });
});
