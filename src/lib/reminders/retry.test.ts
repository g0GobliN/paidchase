import { describe, expect, it } from "vitest";

import { MAX_ATTEMPTS, STUCK_CLAIM_MS, retryDelayMs } from "./processor.server";
import { isRetryableStatus } from "../email/resend.server";

describe("isRetryableStatus", () => {
  it("retries rate limiting", () => {
    expect(isRetryableStatus(429)).toBe(true);
  });

  it("retries provider-side failures", () => {
    expect(isRetryableStatus(500)).toBe(true);
    expect(isRetryableStatus(502)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
  });

  it("does not retry a rejected message", () => {
    // Re-sending to an address the provider refused just burns reputation.
    expect(isRetryableStatus(400)).toBe(false);
    expect(isRetryableStatus(401)).toBe(false);
    expect(isRetryableStatus(403)).toBe(false);
    expect(isRetryableStatus(422)).toBe(false);
  });
});

describe("retryDelayMs", () => {
  it("backs off progressively", () => {
    const first = retryDelayMs(0);
    const second = retryDelayMs(1);
    const third = retryDelayMs(2);

    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(first);
    expect(third).toBeGreaterThan(second);
  });

  it("clamps rather than growing without bound", () => {
    expect(retryDelayMs(99)).toBe(retryDelayMs(2));
  });
});

describe("retry budget", () => {
  it("gives up after a bounded number of attempts", () => {
    expect(MAX_ATTEMPTS).toBeGreaterThan(1);
    expect(MAX_ATTEMPTS).toBeLessThanOrEqual(6);
  });

  it("reclaims a claim that outlived any plausible send", () => {
    // Must exceed the 15s send timeout by a wide margin so a slow-but-alive
    // worker is never robbed of a reminder it is still processing.
    expect(STUCK_CLAIM_MS).toBeGreaterThan(60_000);
  });
});
