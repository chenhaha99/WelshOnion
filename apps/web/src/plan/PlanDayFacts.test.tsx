// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addExpense, updateBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, dayRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function timed(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, minute: number, duration: number): string {
  const result = addBlock(plan, library, { baseId, kindId, title, minute, duration });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function undated(plan: Y.Doc, library: Y.Doc, baseId: string, title: string, kindId: string, duration?: number): string {
  const result = addBlock(plan, library, {
    baseId,
    kindId,
    title,
    slot: "day",
    ...(duration === undefined ? {} : { duration }),
  });
  if (!result.ok) throw new Error("建块失败");
  return result.value.blockId;
}

function drive(plan: Y.Doc, library: Y.Doc, blockId: string, meters: number): void {
  const result = updateBlock(plan, library, blockId, { transport_mode: "drive", distance_m: meters });
  if (!result.ok) throw new Error("改交通失败");
}

function money(plan: Y.Doc, library: Y.Doc, cents: number | null, blockIds: string[]): void {
  const result = addExpense(plan, library, { title: "钱", amountCents: cents, blockIds });
  if (!result.ok) throw new Error("建开销失败");
}

/** 某一天「这天怎么样」那一行的字；没有这一行时是 null。 */
async function factsOf(day: string): Promise<string | null> {
  return (await dayRow(day)).querySelector("[data-day-facts]")?.textContent ?? null;
}

describe("每天写这天怎么样", () => {
  it("各项都有：在组头下面、安排表上面", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      drive(plan, library, timed(plan, library, oct1!, "去西湖", "transit", 480, 60), 32000);
      const lake = timed(plan, library, oct1!, "西湖", "sight", 540, 180);
      const dinner = timed(plan, library, oct1!, "晚饭", "food", 1080, 60);
      undated(plan, library, oct1!, "灵隐寺", "sight", 120);
      money(plan, library, 30000, [lake]);
      money(plan, library, null, [dinner]);
    });

    expect(await factsOf("10.1")).toBe(
      "08:00 起 · 19:00 收工 · 自驾 1 小时 32 公里 · 还有 2 小时没排 · 花 ¥300（还有 1 笔没填）",
    );
    const row = await dayRow("10.1");
    const facts = row.querySelector("[data-day-facts]")!;
    const label = row.querySelector("[data-day-label]")!;
    expect(label.compareDocumentPosition(facts) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(facts.compareDocumentPosition(within(row).getByRole("table")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("一项都没有：没有这一行", async () => {
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "逛街", "shopping");
    });
    expect(await factsOf("10.1")).toBeNull();
  });

  it("排上时间就出现", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "西湖", "sight");
    });
    expect(await factsOf("10.1")).toBeNull();

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "时间" }));
    const editor = screen.getByRole("group", { name: "西湖 的时间" });
    fireEvent.change(within(editor).getByLabelText("开始"), { target: { value: "09:00" } });
    const hours = within(editor).getByRole("spinbutton", { name: "小时" });
    await user.clear(hours);
    await user.type(hours, "3");
    await user.click(within(editor).getByRole("button", { name: "排上时间" }));

    await waitFor(async () => expect(await factsOf("10.1")).toBe("09:00 起 · 12:00 收工"));
  });

  it("填了开销跟着变", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      undated(plan, library, oct1!, "西湖", "sight");
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "开销" }));
    const editor = screen.getByRole("group", { name: "西湖 的开销" });
    await user.type(within(editor).getByRole("textbox", { name: "新一笔的金额" }), "300{Enter}");

    await waitFor(async () => expect(await factsOf("10.1")).toBe("花 ¥300"));
  });
});
