// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addTag, setBlockMark } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTitles, dayRow, daysFromOct1, openDayMenu, openStoredPlan, showView } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

type User = ReturnType<typeof userEvent.setup>;

function block(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId = "sight"): string {
  const result = addBlock(plan, library, { baseId, kindId, title, slot: "day" });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

/** 10.1 三件（西湖、午饭、民宿），10.2 一件（乌镇）；资料库里有「必去」这个标签。 */
function trip(plan: Y.Doc, library: Y.Doc): void {
  const [oct1, oct2] = daysFromOct1(plan, 2);
  block(plan, library, oct1!, "西湖");
  block(plan, library, oct1!, "午饭", "food");
  block(plan, library, oct1!, "民宿", "lodging");
  block(plan, library, oct2!, "乌镇");
  if (!addTag(library, { name: "必去", color: "#c08d68" }).ok) throw new Error("建标签失败");
}

function bulkButton(): HTMLElement {
  return screen.getByRole("button", { name: /^对这 \d+ 件事$/ });
}

/** 点开「对这 N 件…」，选一项（要进二级的，再选二级里的那一项）。 */
async function bulk(user: User, item: string, second?: string): Promise<void> {
  await user.click(bulkButton());
  const menu = screen.getByRole("menu");
  await user.click(within(menu).getByRole("menuitem", { name: item }));
  if (second !== undefined) {
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: second }));
  }
}

function notice(): string | null {
  return document.querySelector("[data-done-notice]")?.textContent ?? null;
}

describe("一键批量", () => {
  it("按钮上写现在看得见的件数", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    expect(bulkButton().textContent).toBe("对这 4 件…");

    // 只看游玩：剩「西湖」「乌镇」
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "游玩" }));

    await waitFor(() => expect(bulkButton().textContent).toBe("对这 2 件…"));
  });

  it("一件都看不见时没有这个按钮", async () => {
    await openStoredPlan((plan) => daysFromOct1(plan, 2));

    await screen.findByRole("group", { name: "视图" });
    expect(screen.queryByRole("button", { name: /^对这/ })).toBeNull();
  });

  it("一起划掉：看得见的都划掉，出提示，撤销一下全回来", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await bulk(user, "划掉");

    await waitFor(async () => expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("struck"));
    expect((await blockRow("10.2", "乌镇")).dataset.mark).toBe("struck");
    expect(notice()).toContain("4 件事的标记都改成了「划掉」");

    await user.click(within(screen.getByRole("status", { name: "刚做完的提示" })).getByRole("button", { name: "撤销" }));

    await waitFor(async () => expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("decided"));
    expect((await blockRow("10.2", "乌镇")).dataset.mark).toBe("decided");
    // 撤销的按钮点完就没了：焦点落回「对这 4 件…」
    await waitFor(() => expect(document.activeElement).toBe(bulkButton()));
  });

  it("只对看得见的做：筛掉的那几件不动", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "住宿" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["民宿"]));

    await bulk(user, "设成待定");

    await waitFor(async () => expect((await blockRow("10.1", "民宿")).dataset.mark).toBe("pending"));
    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "全部类型" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "午饭", "民宿"]));
    expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("decided");
  });

  it("加标签：看得见的都挂上", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await bulk(user, "加标签…", "必去");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "标签：必去" })).toBeTruthy(),
    );
    expect(notice()).toContain("4 件事都挂上了「必去」");
  });

  it("摘标签：只列这几件身上挂着的；一个都没挂时按不了", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await user.click(bulkButton());
    expect(within(screen.getByRole("menu")).getByRole<HTMLButtonElement>("menuitem", { name: "摘标签…" }).disabled).toBe(true);
    await user.keyboard("{Escape}");

    await bulk(user, "加标签…", "必去");
    await waitFor(() => expect(notice()).toContain("挂上了"));

    await bulk(user, "摘标签…", "必去");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).queryByRole("button", { name: "标签：必去" })).toBeNull(),
    );
    expect(notice()).toContain("4 件事都摘掉了「必去」");
  });

  it("改类型：看得见的都改成住宿", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await bulk(user, "改类型…", "住宿");

    await waitFor(async () =>
      expect(
        within(await blockRow("10.1", "西湖")).getByRole("button", { name: /^类型：/ }).getAttribute("aria-label"),
      ).toBe("类型：住宿"),
    );
    expect(notice()).toContain("4 件事都改成了「住宿」");
  });

  it("每天的菜单「这天全部…」只作用于这天", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await user.click(within(await openDayMenu(user, "10.1")).getByRole("menuitem", { name: "这天全部…" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "划掉" }));

    await waitFor(async () => expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("struck"));
    expect((await blockRow("10.1", "民宿")).dataset.mark).toBe("struck");
    expect((await blockRow("10.2", "乌镇")).dataset.mark).toBe("decided");
    expect(notice()).toContain("3 件事的标记都改成了「划掉」");
  });

  it("这天一件都没有时，「这天全部…」按不了", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 2);
      block(plan, library, oct1!, "西湖");
    });
    await showView("日程");

    expect(within(await openDayMenu(user, "10.2")).getByRole<HTMLButtonElement>("menuitem", { name: "这天全部…" }).disabled).toBe(true);
  });

  it("二级菜单里能返回上一层", async () => {
    const user = userEvent.setup();
    await openStoredPlan(trip);
    await showView("日程");

    await user.click(bulkButton());
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "改类型…" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "← 返回" }));

    expect(within(screen.getByRole("menu")).getByRole("menuitem", { name: "划掉" })).toBeTruthy();
    // 返回不改东西
    expect((await blockRow("10.1", "西湖")).dataset.mark).toBe("decided");
  });

  it("三档都是一档时，那一项按不了", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const lake = block(plan, library, oct1!, "西湖");
      const lunch = block(plan, library, oct1!, "午饭", "food");
      if (!setBlockMark(plan, [lake, lunch], "struck").ok) throw new Error("划掉失败");
    });
    await showView("日程");
    await expect(dayRow("10.1")).resolves.toBeTruthy();

    await user.click(bulkButton());

    expect(within(screen.getByRole("menu")).getByRole<HTMLButtonElement>("menuitem", { name: "划掉" }).disabled).toBe(true);
    expect(within(screen.getByRole("menu")).getByRole<HTMLButtonElement>("menuitem", { name: "设成待定" }).disabled).toBe(false);
  });
});
