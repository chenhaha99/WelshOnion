// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addTag, setBlockMark, setBlockTag, type AddBlockInput } from "@welshonion/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import {
  blockRow,
  blockTitles,
  dayRow,
  daysFromOct1,
  openPlanSettings,
  openStoredPlan,
  showView,
  stubNarrowScreen,
} from "./test-helpers";

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

function tag(library: Y.Doc, name: string, color: string): string {
  const result = addTag(library, { name, color });
  if (!result.ok) throw new Error("建标签失败");
  return result.value.tagId;
}

interface Seed {
  /** 按标题给哪几件挂哪几个标签（标签按名字） */
  tags?: Record<string, string[]>;
  done?: string[];
  /** 另外再建几个标签，凑数用 */
  extraTags?: string[];
}

/**
 * 10.1：游玩「西湖」09:00 起 3 小时、游玩「灵隐寺」14:00 起 2 小时、游玩「看潮」12:30 起 0 分钟、没排时间的购物「河坊街」。
 * 资料库里有标签「必去」「下雨也能去」。
 */
async function oneDay(seed: Seed = {}): Promise<void> {
  await openStoredPlan((plan, library) => {
    const [oct1] = daysFromOct1(plan, 1);
    const tagIds: Record<string, string> = {
      必去: tag(library, "必去", "#c08d68"),
      下雨也能去: tag(library, "下雨也能去", "#6b8fb0"),
    };
    for (const name of seed.extraTags ?? []) tagIds[name] = tag(library, name, "#9b8ab2");
    const ids: Record<string, string> = {
      西湖: block(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", minute: 540, duration: 180 }),
      灵隐寺: block(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", minute: 840, duration: 120 }),
      看潮: block(plan, library, { baseId: oct1!, kindId: "sight", title: "看潮", minute: 750, duration: 0 }),
      河坊街: block(plan, library, { baseId: oct1!, kindId: "shopping", title: "河坊街", slot: "day" }),
    };
    for (const [title, names] of Object.entries(seed.tags ?? {})) {
      for (const name of names) setBlockTag(plan, library, [ids[title]!], tagIds[name]!, true);
    }
    if (seed.done) setBlockMark(plan, seed.done.map((title) => ids[title]!), "done");
  });
}

async function timeline(): Promise<HTMLElement> {
  return screen.findByRole("region", { name: "时间线" });
}

/** 时间线上读屏名以「title 」开头的那个按钮（横条、竖条、条上的一件）。 */
async function blockButton(title: string): Promise<HTMLElement> {
  return within(await timeline()).getByRole("button", { name: new RegExp(`^${title} `) });
}

function tagsOn(button: HTMLElement): HTMLElement | null {
  return button.querySelector<HTMLElement>("[data-block-tags]");
}

/** 块上挂着的书签，从左到右各是什么颜色。 */
function ribbonColors(button: HTMLElement): string[] {
  return [...button.querySelectorAll<SVGElement>("[data-tag-ribbon]")].map((ribbon) => ribbon.style.color);
}

function quickBar(title: string): HTMLElement {
  return screen.getByRole("toolbar", { name: `「${title}」的操作` });
}

async function openTagPicker(user: User, trigger: HTMLElement): Promise<HTMLElement> {
  await user.click(trigger);
  return screen.findByRole("dialog", { name: "选择标签" });
}

describe("块上画出标签", () => {
  it("横条上一排书签，按标签的顺序；鼠标停上去写名字；读屏名在时间后面写标签名", async () => {
    await oneDay({ tags: { 西湖: ["下雨也能去", "必去"] } });
    await showView("时间线");

    const lake = await blockButton("西湖");
    expect(tagsOn(lake)?.getAttribute("title")).toBe("必去、下雨也能去");
    expect(ribbonColors(lake)).toEqual(["#c08d68", "#6b8fb0"]);
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 必去、下雨也能去");
    expect(tagsOn(await blockButton("灵隐寺"))).toBeNull();
  });

  it("4 个以上画 2 条书签加「+N」", async () => {
    await oneDay({ extraTags: ["带老人", "要预约"], tags: { 西湖: ["必去", "下雨也能去", "带老人", "要预约"] } });
    await showView("时间线");

    const lake = await blockButton("西湖");
    expect(ribbonColors(lake)).toHaveLength(2);
    expect(tagsOn(lake)?.textContent).toBe("+2");
    expect(tagsOn(lake)?.getAttribute("title")).toBe("必去、下雨也能去、带老人、要预约");
  });

  it("完成了的：读屏名先写标签，再写已完成；书签照画", async () => {
    await oneDay({ tags: { 西湖: ["必去"] }, done: ["西湖"] });
    await showView("时间线");

    const lake = await blockButton("西湖");
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 必去 · 已完成");
    expect(ribbonColors(lake)).toHaveLength(1);
  });

  it("时长为 0 的竖线不画书签，读屏名照样写", async () => {
    await oneDay({ tags: { 看潮: ["必去"] } });
    await showView("时间线");

    const tide = await blockButton("看潮");
    expect(tagsOn(tide)).toBeNull();
    expect(tide.getAttribute("aria-label")).toBe("看潮 12:30 · 必去");
  });

  it("「没排时间」条上的一件、手机上的竖条也画", async () => {
    stubNarrowScreen();
    await oneDay({ tags: { 西湖: ["必去"], 河坊街: ["下雨也能去"] } });
    await showView("时间线");

    expect(ribbonColors(await blockButton("西湖"))).toEqual(["#c08d68"]);
    expect(ribbonColors(await blockButton("河坊街"))).toEqual(["#6b8fb0"]);
  });
});

describe("别处的标签也画成书签，类型还是圆点", () => {
  it("筛选按钮、日程的标签列、选择面板、设置里", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });

    const tagChips = await screen.findByRole("group", { name: "按标签筛选" });
    expect(within(tagChips).getByRole("button", { name: "必去" }).querySelector("[data-tag-ribbon]")).not.toBeNull();
    expect(screen.getByRole("group", { name: "按类型筛选" }).querySelector("[data-tag-ribbon]")).toBeNull();

    const listButton = within(await blockRow("10.1", "西湖")).getByRole("button", { name: "标签：必去" });
    expect(ribbonColors(listButton)).toEqual(["#c08d68"]);
    const picker = await openTagPicker(user, listButton);
    expect(ribbonColors(within(picker).getByRole("button", { name: "下雨也能去" }))).toEqual(["#6b8fb0"]);
    await user.keyboard("{Escape}");

    const settings = await openPlanSettings(user, "标签");
    const manager = within(settings).getByRole("group", { name: "标签的管理" });
    expect(manager.querySelectorAll("[data-tag-ribbon]")).toHaveLength(2);
  });
});

describe("在快捷条和日程里挂上、摘下", () => {
  it("快捷条「类型」后面是「标签」：点开一项一个开关，挂上两个面板不关；每挂一个一步撤销", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const names = within(quickBar("西湖"))
      .getAllByRole("button")
      .map((button) => button.getAttribute("aria-label"));
    expect(names.slice(0, 4)).toEqual(["标记：确定", "详情…", "类型：游玩", "标签：没有"]);

    const picker = await openTagPicker(user, within(quickBar("西湖")).getByRole("button", { name: "标签：没有" }));
    await user.click(within(picker).getByRole("button", { name: "必去" }));
    await waitFor(() => expect(within(picker).getByRole("button", { name: "必去" }).getAttribute("aria-pressed")).toBe("true"));
    await user.click(within(picker).getByRole("button", { name: "下雨也能去" }));

    await waitFor(() =>
      expect(within(quickBar("西湖")).getByRole("button", { name: "标签：必去、下雨也能去" })).toBeTruthy(),
    );
    expect(screen.getByRole("dialog", { name: "选择标签" })).toBe(picker);
    expect(ribbonColors(await blockButton("西湖"))).toHaveLength(2);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "选择标签" })).toBeNull());
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(() => expect(within(quickBar("西湖")).getByRole("button", { name: "标签：必去" })).toBeTruthy());
  });

  it("再点一下摘下", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const picker = await openTagPicker(user, within(quickBar("西湖")).getByRole("button", { name: "标签：必去" }));
    await user.click(within(picker).getByRole("button", { name: "必去" }));

    await waitFor(() => expect(within(quickBar("西湖")).getByRole("button", { name: "标签：没有" })).toBeTruthy());
    expect(tagsOn(await blockButton("西湖"))).toBeNull();
  });

  it("面板里新建：建好就挂上，回到标签列表", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const picker = await openTagPicker(user, within(quickBar("西湖")).getByRole("button", { name: "标签：没有" }));
    await user.click(within(picker).getByRole("button", { name: "+ 新建标签" }));
    await user.type(within(picker).getByRole("textbox", { name: "名字" }), "带老人");
    await user.click(within(picker).getByRole("button", { name: "确定" }));

    await waitFor(() => expect(within(picker).getByRole("button", { name: "带老人" }).getAttribute("aria-pressed")).toBe("true"));
    expect(within(quickBar("西湖")).getByRole("button", { name: "标签：带老人" })).toBeTruthy();
    expect(within(picker).getByText("改名、改颜色、删除在计划设置里")).toBeTruthy();
  });

  it("面板里新建一半取消：焦点回到「+ 新建标签」", async () => {
    const user = userEvent.setup();
    await oneDay();
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const picker = await openTagPicker(user, within(quickBar("西湖")).getByRole("button", { name: "标签：没有" }));
    await user.click(within(picker).getByRole("button", { name: "+ 新建标签" }));
    await user.click(within(picker).getByRole("button", { name: "取消" }));

    await waitFor(() => expect(document.activeElement).toBe(within(picker).getByRole("button", { name: "+ 新建标签" })));
  });

  it("时间线上摘掉以后被标签筛掉：快捷条和面板一起没了，焦点落到这天的菜单", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });
    await user.click(within(await screen.findByRole("group", { name: "按标签筛选" })).getByRole("button", { name: "必去" }));
    await showView("时间线");

    await user.click(await blockButton("西湖"));
    const picker = await openTagPicker(user, within(quickBar("西湖")).getByRole("button", { name: "标签：必去" }));
    await user.click(within(picker).getByRole("button", { name: "必去" }));

    await waitFor(async () => expect(within(await timeline()).queryByRole("button", { name: /^西湖 / })).toBeNull());
    expect(screen.queryByRole("dialog", { name: "选择标签" })).toBeNull();
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await timeline()).getByRole("button", { name: "这天的操作" })),
    );
  });

  it("日程里摘掉以后被标签筛掉：焦点落到下一行的「标签」", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"], 灵隐寺: ["必去"] } });
    await user.click(within(await screen.findByRole("group", { name: "按标签筛选" })).getByRole("button", { name: "必去" }));

    const picker = await openTagPicker(user, within(await blockRow("10.1", "西湖")).getByRole("button", { name: "标签：必去" }));
    await user.click(within(picker).getByRole("button", { name: "必去" }));

    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "标签：必去" })),
    );
  });

  it("日程里「类型」后面一列「标签」：没挂淡色写「加标签」，挂了写名字", async () => {
    const user = userEvent.setup();
    await oneDay();

    const row = await blockRow("10.1", "西湖");
    const button = within(row).getByRole("button", { name: "标签：没有" });
    expect(button.textContent).toBe("加标签");
    const picker = await openTagPicker(user, button);
    await user.click(within(picker).getByRole("button", { name: "必去" }));

    await waitFor(() => expect(within(row).getByRole("button", { name: "标签：必去" }).textContent).toBe("必去"));
  });
});

describe("在设置里管标签", () => {
  it("一项一行写着在用几件；删之前说几件事挂着，删完那件事就不带它了", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });

    const settings = await openPlanSettings(user, "标签");
    const manager = within(settings).getByRole("group", { name: "标签的管理" });
    expect(within(settings).getByText(/所有计划共用/)).toBeTruthy();
    expect(within(manager).getByText("这个计划里 1 件在用")).toBeTruthy();

    await user.click(within(manager).getByRole("button", { name: "删除：必去" }));
    expect(within(manager).getByText(/这个计划里有 1 件事挂着/)).toBeTruthy();
    await user.click(within(manager).getByRole("button", { name: "删除" }));
    await waitFor(() => expect(within(manager).queryByRole("button", { name: "删除：必去" })).toBeNull());

    await user.keyboard("{Escape}");
    await waitFor(async () =>
      expect(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "标签：没有" })).toBeTruthy(),
    );
  });

  it("改名、改颜色", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });

    const settings = await openPlanSettings(user, "标签");
    const manager = within(settings).getByRole("group", { name: "标签的管理" });
    await user.click(within(manager).getByRole("button", { name: "改名：必去" }));
    const name = within(manager).getByRole("textbox", { name: "新名字" });
    await user.clear(name);
    await user.type(name, "一定要去{Enter}");
    await user.click(await within(manager).findByRole("button", { name: "改颜色：一定要去" }));
    await user.click(within(manager).getByRole("button", { name: "颜色 #6fa3a0" }));
    await user.keyboard("{Escape}");

    await showView("时间线");
    const lake = await blockButton("西湖");
    expect(lake.getAttribute("aria-label")).toBe("西湖 09:00–12:00 · 一定要去");
    expect(ribbonColors(lake)).toEqual(["#6fa3a0"]);
  });
});

describe("按标签筛选", () => {
  it("一件都没挂时没有这一排；挂了就出现，只列挂着的", async () => {
    await oneDay();
    await screen.findByRole("group", { name: "按类型筛选" });
    expect(screen.queryByRole("group", { name: "按标签筛选" })).toBeNull();
    cleanup();
    await releaseAll();

    await oneDay({ tags: { 西湖: ["必去"] } });
    const group = await screen.findByRole("group", { name: "按标签筛选" });
    expect(within(group).getAllByRole("button").map((button) => button.textContent)).toEqual(["必去"]);
  });

  it("按下几个：带其中任何一个的留下；和类型一起时都要满足；全部标签清空", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"], 灵隐寺: ["下雨也能去"], 河坊街: ["必去"] } });
    const tags = await screen.findByRole("group", { name: "按标签筛选" });

    await user.click(within(tags).getByRole("button", { name: "必去" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "河坊街"]));
    await user.click(within(tags).getByRole("button", { name: "下雨也能去" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖", "灵隐寺", "河坊街"]));

    await user.click(within(screen.getByRole("group", { name: "按类型筛选" })).getByRole("button", { name: "购物" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["河坊街"]));

    await user.click(within(tags).getByRole("button", { name: "全部标签" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["河坊街"]));
    expect(within(tags).queryByRole("button", { name: "全部标签" })).toBeNull();
  });

  it("只按下一个标签时加一件：带着这个标签，看得见", async () => {
    const user = userEvent.setup();
    await oneDay({ tags: { 西湖: ["必去"] } });
    await user.click(within(await screen.findByRole("group", { name: "按标签筛选" })).getByRole("button", { name: "必去" }));

    await user.type(within(await dayRow("10.1")).getByRole("textbox", { name: "加一件事" }), "断桥{Enter}");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "断桥")).getByRole("button", { name: "标签：必去" })).toBeTruthy(),
    );
  });
});
