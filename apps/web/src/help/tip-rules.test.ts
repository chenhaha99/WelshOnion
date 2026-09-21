import { describe, expect, it } from "vitest";
import { EMPTY_TIP_STATE, pickTip, recordShown, type TipDef, type TipState } from "./tip-rules";

interface Ctx {
  phone: boolean;
}

const TIPS: TipDef<Ctx>[] = [
  { id: "a", help: "handle-drag", when: (ctx) => ctx.phone, title: "A", body: "" },
  { id: "b", help: "pinch", when: (ctx) => ctx.phone, title: "B", body: "" },
  { id: "c", help: "blank-add", when: (ctx) => !ctx.phone, title: "C", body: "" },
];
const DAY = 24 * 3600_000;
const T0 = Date.parse("2026-09-21T08:00:00Z");
const pick = (state: TipState, used: string[] = [], at = T0, ctx: Ctx = { phone: true }) =>
  pickTip(TIPS, ctx, new Set(used) as never, state, at)?.id ?? null;

describe("场景小提示挑哪一条（照苹果 TipKit 的规则）", () => {
  it("条件满足的第一条；条件不满足的不出", () => {
    expect(pick(EMPTY_TIP_STATE)).toBe("a");
    expect(pick(EMPTY_TIP_STATE, [], T0, { phone: false })).toBe("c");
  });

  it("用过那个功能的不出（已经会的人不该再看到提示）", () => {
    expect(pick(EMPTY_TIP_STATE, ["handle-drag"])).toBe("b");
  });

  it("点过 ✕ 的永远不出", () => {
    expect(pick({ ...EMPTY_TIP_STATE, closed: ["a"] })).toBe("b");
  });

  it("出现满 5 次还没采纳：作废", () => {
    let state = EMPTY_TIP_STATE;
    for (let i = 0; i < 5; i++) state = recordShown(state, "a", T0 + i);
    expect(pick(state, [], T0 + 10)).toBeNull(); // b 要等一天
    expect(pick(state, [], T0 + DAY + 10)).toBe("b");
  });

  it("两条提示之间至少隔一天：同一条可以接着出，换一条要等", () => {
    const state = recordShown(EMPTY_TIP_STATE, "a", T0);
    expect(pick(state, [], T0 + 3600_000)).toBe("a");
    // a 用过了：b 当天不出，第二天才出
    expect(pick(state, ["handle-drag"], T0 + 3600_000)).toBeNull();
    expect(pick(state, ["handle-drag"], T0 + DAY)).toBe("b");
  });

  it("上次那条还能出：优先接着出它，不被排在前面的新一条挡掉", () => {
    // 手机上出过 b（双指放大）；这会儿 a（拖两端）也满足条件，但离 b 不到一天
    const state = recordShown(EMPTY_TIP_STATE, "b", T0);
    expect(pick(state, [], T0 + 3600_000)).toBe("b");
  });

  it("记一次出现：次数加一，记下是哪条、什么时候", () => {
    const state = recordShown(recordShown(EMPTY_TIP_STATE, "a", T0), "a", T0 + 5);
    expect(state.shown).toEqual({ a: 2 });
    expect(state.last).toEqual({ id: "a", at: T0 + 5 });
  });
});
