// @vitest-environment happy-dom
import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openStoredPlan, readStoredPlan, selectedText } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

function oneDayWith(title: string, kindId = "sight") {
  return (plan: Y.Doc, library: Y.Doc) => {
    const [oct1] = daysFromOct1(plan, 1);
    addBlock(plan, library, { baseId: oct1!, kindId, title, slot: "day" });
  };
}

async function storedBlock(planId: string, title: string) {
  const view = await readStoredPlan(planId);
  return [...view.blocks.values()].find((block) => block.title === title);
}

describe("改标题、类型、状态", () => {
  it("改标题：回车就存下", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(oneDayWith("西湖"));

    const title = within(await blockRow("10.1", "西湖")).getByRole("textbox", { name: "标题" });
    await user.clear(title);
    await user.type(title, "西湖游船{Enter}");

    await waitFor(async () => expect(await storedBlock(planId, "西湖游船")).toBeTruthy());
  });

  it("改类型", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(oneDayWith("午饭"));

    const kind = within(await blockRow("10.1", "午饭")).getByRole("combobox", { name: "类型" });
    await user.selectOptions(kind, "food");

    await waitFor(async () => expect((await storedBlock(planId, "午饭"))?.kind.id).toBe("food"));
    expect(selectedText(within(await blockRow("10.1", "午饭")).getByRole("combobox", { name: "类型" }))).toBe("餐饮");
  });

  it("改状态：已确认不再是虚线", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(oneDayWith("西湖"));

    expect((await blockRow("10.1", "西湖")).dataset.pending).toBe("true");
    await user.selectOptions(within(await blockRow("10.1", "西湖")).getByRole("combobox", { name: "状态" }), "confirmed");

    await waitFor(async () => expect((await storedBlock(planId, "西湖"))?.status.id).toBe("confirmed"));
    expect((await blockRow("10.1", "西湖")).dataset.pending).toBe("false");
  });
});
