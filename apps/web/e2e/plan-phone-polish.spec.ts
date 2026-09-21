import { expect, test, type Locator } from "@playwright/test";
import { DAY1, addBlocks, addMoney, newPlan, rowOf, schedule, showView } from "./timeline-helpers";
import { watchErrors } from "./walkthrough";

/** 两个元素在同一行：竖着的中线差不到 8 像素。 */
async function expectSameLine(a: Locator, b: Locator, name: string): Promise<void> {
  const boxA = (await a.boundingBox())!;
  const boxB = (await b.boundingBox())!;
  expect(Math.abs(boxA.y + boxA.height / 2 - (boxB.y + boxB.height / 2)), `${name}在同一行`).toBeLessThan(8);
}

test("手机上时间的编辑区：「开始」和它的框、「时长」和小时分钟不拆开", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["河坊街"]);
  await (await rowOf(table, "河坊街")).getByRole("button", { name: "时间" }).click();
  const editor = page.getByRole("group", { name: "河坊街 的时间" });
  await expect(editor).toBeVisible();

  await expectSameLine(editor.getByText("开始", { exact: true }), editor.getByLabel("开始"), "「开始」和它的框");
  const duration = editor.getByText("时长", { exact: true });
  const parts: Array<[string, Locator]> = [
    ["小时的框", editor.getByRole("spinbutton", { name: "小时" })],
    ["「小时」", editor.getByText("小时", { exact: true })],
    ["分钟的框", editor.getByRole("spinbutton", { name: "分钟" })],
    ["「分钟」", editor.getByText("分钟", { exact: true })],
  ];
  for (const [name, part] of parts) await expectSameLine(duration, part, `「时长」和${name}`);
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("02-phone-time-editor.png") });

  expect(errors).toEqual([]);
});

test("手机上开销的编辑区：一笔开销分两行，说明框写着「说明」", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 1, { width: 390, height: 844 });
  const table = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, table, ["西湖"]);
  await (await rowOf(table, "西湖")).getByRole("button", { name: "开销" }).click();
  const editor = page.getByRole("group", { name: "西湖 的开销" });
  await editor.getByRole("textbox", { name: "新一笔的金额" }).fill("60");
  await page.keyboard.press("Enter");
  const expense = editor.locator("[data-expense-id]").first();
  const amount = expense.getByRole("textbox", { name: "金额" });
  await expect(amount).toHaveValue("60");

  const kind = expense.getByRole("button", { name: /^类型：/ });
  await expectSameLine(kind, amount, "类型和金额");
  await expectSameLine(kind, expense.getByRole("combobox", { name: "按总价还是人均" }), "类型和「总价」");
  const note = expense.getByRole("textbox", { name: "说明" });
  await expect(note).toHaveAttribute("placeholder", "说明");
  await expectSameLine(note, expense.getByRole("button", { name: "删除这笔" }), "说明框和「删除这笔」");
  expect((await note.boundingBox())!.y, "说明框在下一行").toBeGreaterThan((await kind.boundingBox())!.y + 10);
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("03-phone-money-editor.png") });

  // 电脑上：一笔开销的几样还在同一行
  await page.setViewportSize({ width: 1280, height: 900 });
  const onDesktop: Array<[string, Locator]> = [
    ["金额", amount],
    ["「总价」", expense.getByRole("combobox", { name: "按总价还是人均" })],
    ["说明框", note],
    ["「删除这笔」", expense.getByRole("button", { name: "删除这笔" })],
  ];
  for (const [name, part] of onDesktop) await expectSameLine(kind, part, `电脑上类型和${name}`);
  await editor.scrollIntoViewIfNeeded();
  await page.screenshot({ path: test.info().outputPath("04-desktop-money-editor.png") });

  expect(errors).toEqual([]);
});

/**
 * 手机上把系统字号调到最大（安卓最大一档约 1.3 倍）时，整页都不该横着滚。
 * 安卓的 WebView 跟着系统字号走，rem 也跟着变大，页顶那一排图标、总览每类那一行以前都会撑出屏幕；
 * 一横滚，右边的东西（重做按钮、条上的百分比）就看不见了。360 是在产安卓机的最小宽度。
 */
test("360 宽、系统字号调到最大：三个视图都不横着滚", async ({ page }) => {
  const errors = watchErrors(page);
  await newPlan(page, 3, { width: 360, height: 844 });
  const day1 = page.getByRole("table", { name: DAY1 });
  await addBlocks(page, day1, ["夜车去苏州看园林"]);
  await schedule(page, day1, "夜车去苏州看园林", "20:00", "10", "10");
  await addMoney(page, day1, "夜车去苏州看园林", "1280");
  // 名字起长一点：标题该被截断，不该把整行撑出去
  await page.getByRole("button", { name: "计划设置" }).first().click();
  await page.getByLabel("名字").fill("国庆七天江浙沪深度游加苏州园林");
  await page.getByRole("dialog").getByRole("button", { name: "关闭" }).click();
  await page.addStyleTag({ content: "html { font-size: 20.8px }" });

  for (const view of ["时间线", "日程", "总览"] as const) {
    await showView(page, view);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(over, `${view}横向多出来的`).toBeLessThanOrEqual(1);
  }
  // 右上角那几个图标一个都不能被挤出屏幕
  for (const name of ["搜索", "计划设置", "撤销", "重做"]) {
    const box = (await page.getByRole("button", { name, exact: true }).first().boundingBox())!;
    expect(box.x + box.width, `「${name}」在屏幕里`).toBeLessThanOrEqual(360);
    expect(box.x, `「${name}」在屏幕里`).toBeGreaterThanOrEqual(0);
  }
  expect(errors).toEqual([]);
});
