// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, type PlanView } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openOtherTab, openStoredPlan } from "./test-helpers";

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

function blockTitled(plan: PlanView, title: string) {
  return [...plan.blocks.values()].find((block) => block.title === title);
}

describe("改标题、类型", () => {
  it("改标题：回车就存下", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(oneDayWith("西湖"));
    const other = await openOtherTab(planId);

    const title = within(await blockRow("10.1", "西湖")).getByRole("textbox", { name: "标题" });
    await user.clear(title);
    await user.type(title, "西湖游船{Enter}");

    await waitFor(() => expect(blockTitled(other.plan(), "西湖游船")).toBeTruthy());
  });

  it("改类型", async () => {
    const user = userEvent.setup();
    const planId = await openStoredPlan(oneDayWith("午饭"));
    const other = await openOtherTab(planId);

    await user.click(within(await blockRow("10.1", "午饭")).getByRole("button", { name: /^类型：/ }));
    await user.click(within(screen.getByRole("dialog", { name: "选择类型" })).getByRole("button", { name: "餐饮" }));

    await waitFor(() => expect(blockTitled(other.plan(), "午饭")?.kind.id).toBe("food"));
    expect(within(await blockRow("10.1", "午饭")).getByRole("button", { name: "类型：餐饮" })).toBeTruthy();
  });
});
