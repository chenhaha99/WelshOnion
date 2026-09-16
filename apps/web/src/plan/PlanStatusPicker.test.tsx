// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, addStatus } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, daysFromOct1, openPlanSettings, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

describe("状态选择器和状态的管理", () => {
  it("新建「已预订」并用上：边框是实线", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "lodging", title: "酒店", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "酒店")).getByRole("button", { name: "状态：待定" }));
    const picker = screen.getByRole("dialog", { name: "选择状态" });
    await user.click(within(picker).getByRole("button", { name: "+ 新建状态" }));
    await user.type(within(picker).getByRole("textbox", { name: "名字" }), "已预订");
    await user.click(within(picker).getByRole("button", { name: "确定" }));

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "酒店")).getByRole("button", { name: "状态：已预订" })).toBeTruthy(),
    );
    expect((await blockRow("10.1", "酒店")).dataset.pending).toBe("false");
  });

  it("删状态：在用的块写「已删除的状态」", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const booked = addStatus(library, { name: "已预订", color: "#6b8fb0" });
      if (!booked.ok) throw new Error("建状态失败");
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, {
        baseId: oct1!,
        kindId: "lodging",
        title: "酒店",
        slot: "day",
        statusId: booked.value.statusId,
      });
    });

    // 删除搬到了计划设置里
    const settings = await openPlanSettings(user, "类型和状态");
    const manager = within(settings).getByRole("group", { name: "状态的管理" });
    await user.click(within(manager).getByRole("button", { name: "删除：已预订" }));
    expect(within(manager).getByText(/这个计划里有 1 件事在用/)).toBeTruthy();
    await user.click(within(manager).getByRole("button", { name: "删除" }));
    await user.keyboard("{Escape}");

    await waitFor(async () =>
      expect(within(await blockRow("10.1", "酒店")).getByRole("button", { name: "状态：已删除的状态" })).toBeTruthy(),
    );
  });
});
