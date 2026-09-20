import { expect, test, type Page } from "@playwright/test";
import * as Y from "yjs";
import { addBlocks, addMoney, DAY1, newPlan, rowOf, schedule, showView } from "./timeline-helpers";
import { shot, watchErrors } from "./walkthrough";

/** 列表里计划卡片的标题；面板开着时它的标题也是二级标题，不在列表项里，不算。 */
function cardTitles(page: Page) {
  return page.getByRole("listitem").getByRole("heading", { level: 2 });
}

/** 列表页上点「设置」；计划页的「计划设置」名字里也有「设置」，要精确匹配。 */
async function openSettings(page: Page) {
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const panel = page.getByRole("dialog", { name: "设置", exact: true });
  await expect(panel).toBeVisible();
  return panel;
}

test("导出 → 删掉 → 空列表上导入恢复 → 再导入另存一份 → 选错文件 → 手机上占满屏幕", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page);
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["西湖"]);
  await schedule(page, day1, "西湖", "09:00", "3");
  await addMoney(page, day1, "西湖", "300");
  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(cardTitles(page)).toHaveText(["国庆杭州"]);

  // 导出：真的下载下来，面板里写已导出
  const panel = await openSettings(page);
  const downloading = page.waitForEvent("download");
  await panel.getByRole("button", { name: "导出「国庆杭州」" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("国庆杭州.welshonion.json");
  const file = test.info().outputPath("国庆杭州.welshonion.json");
  await download.saveAs(file);
  await expect(panel.getByRole("status")).toHaveText("已导出「国庆杭州」");
  await shot(page, "01-exported");
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();

  // 删掉计划，列表空了；空列表上也有「设置」，导入：进入计划，块和开销都在
  const card = page.getByRole("listitem").filter({ has: page.getByRole("heading", { level: 2, name: "国庆杭州" }) });
  await card.getByRole("button", { name: "删除" }).click();
  await card.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByRole("button", { name: "新建第一个计划" })).toBeVisible();
  await shot(page, "02-empty-with-settings");
  await (await openSettings(page)).getByLabel("选择计划文件").setInputFiles(file);
  await expect(page.getByRole("heading", { level: 1, name: "国庆杭州" })).toBeVisible();
  const restored = await rowOf(page.getByRole("table", { name: DAY1 }), "西湖");
  await expect(restored.locator("[data-block-time]")).toHaveText("09:00–12:00");
  await expect(restored.locator("[data-money-cell]")).toHaveText("¥300");

  // 再导入同一个文件：另存一份「（导入）」，列表两张卡
  await page.getByRole("link", { name: /我的计划/ }).click();
  await (await openSettings(page)).getByLabel("选择计划文件").setInputFiles(file);
  await expect(page.getByRole("heading", { level: 1, name: "国庆杭州（导入）" })).toBeVisible();
  await page.getByRole("link", { name: /我的计划/ }).click();
  await expect(cardTitles(page)).toHaveText(["国庆杭州（导入）", "国庆杭州"]);

  // 选一个不是计划的文件：写明原因，面板还开着，计划没变
  const wrong = await openSettings(page);
  await wrong
    .getByLabel("选择计划文件")
    .setInputFiles({ name: "hello.json", mimeType: "application/json", buffer: Buffer.from("hello") });
  await expect(wrong.getByRole("alert")).toHaveText("这个文件不是葱葱导出的计划，没有导入");
  await expect(cardTitles(page)).toHaveCount(2);
  await shot(page, "03-not-a-plan");

  // 手机：设置占满屏幕
  await page.setViewportSize({ width: 390, height: 844 });
  const phoneBox = (await wrong.boundingBox())!;
  expect([phoneBox.x, phoneBox.width]).toEqual([0, 390]);
  await shot(page, "04-phone-settings");

  expect(errors).toEqual([]);
});

/**
 * 旧版本（结构版本 1）导出的文件，照旧版本写的样子直接搭：资料库部分带状态，每件事有 status_id；
 * 10.1「西湖」09:00 起 3 小时、已确认、勾上了，「灵隐寺」14:00 起 2 小时、待定。
 */
function oldVersionFile(): Buffer {
  const doc = new Y.Doc();
  doc.transact(() => {
    doc.getMap("meta").set("schema", 1);
    doc.getMap("meta").set("plan_id", "p-old");
    const plan = doc.getMap("plan");
    plan.set("name", "杭州（旧版本导出）");
    plan.set("traveler_count", 1);
    plan.set("base_currency", "CNY");
    doc.getMap("bases").set(
      "d1",
      new Y.Map<unknown>([
        ["date", "2026-10-01"],
        ["tz", "Asia/Shanghai"],
        ["undated", new Y.Array<string>()],
      ]),
    );
    const blocks = doc.getMap<Y.Map<unknown>>("blocks");
    for (const [id, title, minute, duration, statusId, checked] of [
      ["k1", "西湖", 540, 180, "confirmed", true],
      ["k2", "灵隐寺", 840, 120, "pending", false],
    ] as const) {
      const block = new Y.Map<unknown>([
        ["start_base_id", "d1"],
        ["start_minute", minute],
        ["duration_min", duration],
        ["kind_id", "sight"],
        ["status_id", statusId],
        ["title", title],
        ["created_by", "me"],
        ["place_ids", new Y.Array<string>()],
      ]);
      if (checked) block.set("checked", true);
      blocks.set(id, block);
    }
    doc.getMap("expenses");
  });
  const file = {
    format: "welshonion-plan",
    version: 1,
    exported_at: "2026-09-16T08:00:00.000Z",
    plan: Buffer.from(Y.encodeStateAsUpdate(doc)).toString("base64"),
    library: {
      kinds: [{ id: "sight", name: "游玩", color: "#77a389", layer: 2, order: 5 }],
      statuses: [
        { id: "pending", name: "待定", color: "#9aa3ad", order: 1 },
        { id: "confirmed", name: "已确认", color: "#77a389", order: 2 },
      ],
      places: [],
    },
  };
  return Buffer.from(JSON.stringify(file));
}

test("导入旧版本导出的文件：状态不要了，勾上的是完成的", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await (await openSettings(page))
    .getByLabel("选择计划文件")
    .setInputFiles({ name: "杭州.welshonion.json", mimeType: "application/json", buffer: oldVersionFile() });
  await expect(page.getByRole("heading", { level: 1, name: "杭州（旧版本导出）" })).toBeVisible();

  const table = page.getByRole("table", { name: DAY1 });
  await expect(await rowOf(table, "西湖")).toHaveAttribute("data-mark", "done");
  await expect(await rowOf(table, "灵隐寺")).toHaveAttribute("data-mark", "decided");
  await expect(table.getByRole("button", { name: /^状态/ })).toHaveCount(0);
  await showView(page, "时间线");
  await expect(page.getByRole("region", { name: "时间线" }).getByRole("button", { name: /^西湖 / })).toHaveAttribute(
    "aria-label",
    "西湖 09:00–12:00 · 已完成",
  );
  await shot(page, "05-old-file-imported");

  expect(errors).toEqual([]);
});
