// @vitest-environment happy-dom
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addDayInTz } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import type * as Y from "yjs";
import { releaseAll } from "../storage/test-helpers";
import { blockTexts, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

/** 10.1 北京那天下面加同日期、洛杉矶时区的一天；北京那天 18:00 起飞，飞 12 小时去洛杉矶。 */
function flyToLosAngeles(plan: Y.Doc, library: Y.Doc): void {
  const [oct1] = daysFromOct1(plan, 1);
  const added = addDayInTz(plan, oct1!, "America/Los_Angeles");
  if (!added.ok) throw new Error("加时区失败");
  const flight = addBlock(plan, library, { baseId: oct1!, kindId: "transit", title: "飞洛杉矶", minute: 1080, duration: 720 });
  if (!flight.ok) throw new Error("建块失败");
}

describe("跨时区的时间写两地的时刻", () => {
  it("安排表的时间格", async () => {
    await openStoredPlan(flyToLosAngeles);
    expect(await blockTexts("北京")).toEqual([{ title: "飞洛杉矶", time: "北京 18:00 → 洛杉矶 15:00" }]);
  });

  it("时间轴的详情：点洛杉矶那一行的横条", async () => {
    const user = userEvent.setup();
    await openStoredPlan(flyToLosAngeles);

    const timeline = await screen.findByRole("region", { name: "时间轴" });
    const row = within(timeline)
      .getAllByRole("listitem")
      .find((item) => item.getAttribute("aria-label")?.includes("洛杉矶"));
    if (!row) throw new Error("时间轴上没有洛杉矶那一行");
    await user.click(within(row).getByRole("button", { name: /^飞洛杉矶 / }));

    const dialog = screen.getByRole("dialog", { name: "飞洛杉矶" });
    expect(within(dialog).getByText("北京 18:00 → 洛杉矶 15:00 · 12 小时")).toBeTruthy();
  });
});
