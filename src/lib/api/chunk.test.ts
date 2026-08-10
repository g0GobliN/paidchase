import { describe, expect, it } from "vitest";

import { chunk } from "./sequences.functions";

describe("chunk", () => {
  it("splits a list into bounded batches", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single batch when the list fits", () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });

  it("returns nothing for an empty list", () => {
    expect(chunk([], 10)).toEqual([]);
  });

  it("keeps every element exactly once", () => {
    const items = Array.from({ length: 1001 }, (_, i) => i);
    const batches = chunk(items, 200);

    expect(batches.flat()).toEqual(items);
    expect(batches).toHaveLength(6);
    expect(Math.max(...batches.map((b) => b.length))).toBeLessThanOrEqual(200);
  });

  it("defaults to a batch size PostgREST can carry in a URL", () => {
    const items = Array.from({ length: 500 }, (_, i) => i);
    expect(Math.max(...chunk(items).map((b) => b.length))).toBeLessThanOrEqual(200);
  });

  it("rejects a nonsensical size rather than looping forever", () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow();
  });
});
