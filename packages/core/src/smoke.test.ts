import { expect, test } from "vitest";

test("包入口能被加载", async () => {
  const entry = await import("./index");
  expect(typeof entry).toBe("object");
});
