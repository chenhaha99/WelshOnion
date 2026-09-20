// @vitest-environment happy-dom
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addBlock, setBlockLayer } from "@welshonion/core";
import { afterEach, describe, expect, it } from "vitest";
import { releaseAll } from "../storage/test-helpers";
import { blockRow, blockTitles, dayRow, daysFromOct1, openStoredPlan } from "./test-helpers";

afterEach(async () => {
  cleanup();
  await releaseAll();
});

describe("删除块", () => {
  it("删掉再撤销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));

    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
  });

  it("删完焦点落到下一行的行菜单按钮", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "灵隐寺", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["灵隐寺"]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(
        within(await blockRow("10.1", "灵隐寺")).getByRole("button", { name: "这件事的操作" }),
      ),
    );
  });

  it("删掉最后一行：焦点落到这天的菜单按钮，Ctrl+Z 能撤销", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "西湖", slot: "day" });
    });

    await user.click(within(await blockRow("10.1", "西湖")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
    await waitFor(async () =>
      expect(document.activeElement).toBe(within(await dayRow("10.1")).getByRole("button", { name: "这天的操作" })),
    );
    await user.keyboard("{Control>}z{/Control}");
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual(["西湖"]));
  });

  it("连同里面的块：删除项写明个数，一起删掉", async () => {
    const user = userEvent.setup();
    await openStoredPlan((plan, library) => {
      const [oct1] = daysFromOct1(plan, 1);
      const outer = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "横店一整天", minute: 480, duration: 720 });
      const inner = addBlock(plan, library, { baseId: oct1!, kindId: "sight", title: "明清宫苑", minute: 600, duration: 120 });
      if (!outer.ok || !inner.ok) throw new Error("建块失败");
      setBlockLayer(plan, library, inner.value.blockId, outer.value.blockId);
    });

    await user.click(within(await blockRow("10.1", "横店一整天")).getByRole("button", { name: "这件事的操作" }));
    await user.click(within(screen.getByRole("menu")).getByRole("menuitem", { name: "删除（连同里面的 1 件）" }));
    await waitFor(async () => expect(await blockTitles("10.1")).toEqual([]));
  });
});
