import { afterEach, expect, test, vi } from "vitest";
import { newId } from "./ids";

const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

afterEach(() => {
  vi.useRealTimers();
});

test("格式和不重复", () => {
  const ids = Array.from({ length: 1000 }, () => newId());

  for (const id of ids) {
    expect(id).toMatch(UUID_V7);
  }
  expect(new Set(ids).size).toBe(1000);
});

test("后生成的排在后面", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2099-01-01T00:00:00.000Z"));
  const a = newId();
  vi.setSystemTime(new Date("2099-01-01T00:00:00.002Z"));
  const b = newId();

  expect(b > a).toBe(true);
});
