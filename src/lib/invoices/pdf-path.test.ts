import { describe, expect, it } from "vitest";

import { isPathOwnedBy } from "./pdf-path";

const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("isPathOwnedBy", () => {
  it("accepts a real upload path for the owner", () => {
    expect(isPathOwnedBy(`${USER}/1754820000000-INV-0001.pdf`, USER)).toBe(true);
  });

  it("rejects another user's folder", () => {
    // The leak: user A creating an invoice that points at user B's file, which the
    // service-role worker would then attach and email out.
    expect(isPathOwnedBy(`${OTHER}/1754820000000-INV-0001.pdf`, USER)).toBe(false);
  });

  it("rejects prefix confusion", () => {
    expect(isPathOwnedBy(`${USER}extra/file.pdf`, "user1")).toBe(false);
    expect(isPathOwnedBy("user1abc/file.pdf", "user1")).toBe(false);
  });

  it("rejects parent-directory traversal", () => {
    expect(isPathOwnedBy(`${USER}/../${OTHER}/file.pdf`, USER)).toBe(false);
    expect(isPathOwnedBy(`../${OTHER}/file.pdf`, USER)).toBe(false);
    expect(isPathOwnedBy(`${USER}/..`, USER)).toBe(false);
  });

  it("rejects absolute and backslash paths", () => {
    expect(isPathOwnedBy(`/${USER}/file.pdf`, USER)).toBe(false);
    expect(isPathOwnedBy(`${USER}\\file.pdf`, USER)).toBe(false);
  });

  it("rejects a bare folder with no file", () => {
    expect(isPathOwnedBy(`${USER}/`, USER)).toBe(false);
    expect(isPathOwnedBy(USER, USER)).toBe(false);
  });

  it("rejects empty and missing values", () => {
    expect(isPathOwnedBy("", USER)).toBe(false);
    expect(isPathOwnedBy(null, USER)).toBe(false);
    expect(isPathOwnedBy(undefined, USER)).toBe(false);
    expect(isPathOwnedBy(`${USER}/file.pdf`, "")).toBe(false);
  });

  it("does not treat a leading slash as an empty owner segment", () => {
    expect(isPathOwnedBy("/file.pdf", "")).toBe(false);
  });

  it("allows nested names under the owner folder", () => {
    // Storage keys are flat in practice, but a filename containing a slash must not
    // escape the owner folder — the first segment is still the owner.
    expect(isPathOwnedBy(`${USER}/sub/file.pdf`, USER)).toBe(true);
  });
});
