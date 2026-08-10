import { describe, expect, it } from "vitest";

import { authorizeWorkerRequest, extractWorkerSecret, secretsMatch } from "./worker-auth";

const SECRET = "s3cret-worker-token-abcdef";

function headers(init: Record<string, string>): Headers {
  return new Headers(init);
}

describe("secretsMatch", () => {
  it("accepts an exact match", () => {
    expect(secretsMatch(SECRET, SECRET)).toBe(true);
  });

  it("rejects a different value of the same length", () => {
    expect(secretsMatch("abcdef", "abcdeg")).toBe(false);
  });

  it("rejects a prefix", () => {
    expect(secretsMatch(SECRET, SECRET.slice(0, -1))).toBe(false);
  });

  it("rejects the empty string", () => {
    expect(secretsMatch(SECRET, "")).toBe(false);
  });
});

describe("extractWorkerSecret", () => {
  it("reads the x-worker-secret header", () => {
    expect(extractWorkerSecret(headers({ "x-worker-secret": SECRET }))).toBe(SECRET);
  });

  it("reads a Bearer authorization header", () => {
    expect(extractWorkerSecret(headers({ authorization: `Bearer ${SECRET}` }))).toBe(SECRET);
  });

  it("ignores a non-Bearer authorization scheme", () => {
    expect(extractWorkerSecret(headers({ authorization: `Basic ${SECRET}` }))).toBeNull();
  });

  it("returns null when no credential is present", () => {
    expect(extractWorkerSecret(headers({}))).toBeNull();
  });
});

describe("authorizeWorkerRequest", () => {
  it("authorizes a correct secret", () => {
    expect(authorizeWorkerRequest(headers({ "x-worker-secret": SECRET }), SECRET)).toEqual({
      ok: true,
    });
  });

  it("fails closed when WORKER_SECRET is unset", () => {
    // Critical: an unconfigured worker must never be an open worker.
    const result = authorizeWorkerRequest(headers({ "x-worker-secret": SECRET }), undefined);
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("fails closed when WORKER_SECRET is empty", () => {
    const result = authorizeWorkerRequest(headers({ "x-worker-secret": "" }), "");
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("rejects a request with no credential", () => {
    expect(authorizeWorkerRequest(headers({}), SECRET)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("rejects the wrong secret", () => {
    expect(authorizeWorkerRequest(headers({ "x-worker-secret": "nope" }), SECRET)).toMatchObject({
      ok: false,
      status: 401,
    });
  });

  it("no longer accepts the Supabase publishable key via the apikey header", () => {
    // Regression: the old gate compared against SUPABASE_PUBLISHABLE_KEY, which
    // Vite ships to the browser, so anyone could drive the worker.
    const publishable = "sb_publishable_abc123";
    const result = authorizeWorkerRequest(headers({ apikey: publishable }), SECRET);
    expect(result).toMatchObject({ ok: false, status: 401 });
  });
});
