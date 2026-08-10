import { describe, expect, it } from "vitest";

import { MAX_ATTACHMENT_BYTES, bytesToBase64, isWithinAttachmentLimit } from "./base64";

function bytes(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

describe("bytesToBase64", () => {
  it("matches known vectors", () => {
    expect(bytesToBase64(bytes(""))).toBe("");
    expect(bytesToBase64(bytes("f"))).toBe("Zg==");
    expect(bytesToBase64(bytes("fo"))).toBe("Zm8=");
    expect(bytesToBase64(bytes("foo"))).toBe("Zm9v");
    expect(bytesToBase64(bytes("foobar"))).toBe("Zm9vYmFy");
  });

  it("encodes a PDF header byte-exactly", () => {
    expect(bytesToBase64(bytes("%PDF-1.4"))).toBe("JVBERi0xLjQ=");
  });

  it("handles the full byte range including nulls and high bytes", () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i += 1) all[i] = i;

    const encoded = bytesToBase64(all);
    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(all);
  });

  it("encodes a buffer larger than the chunk size without overflowing the stack", () => {
    // The naive `btoa(String.fromCharCode(...bytes))` throws on input this size.
    const big = new Uint8Array(1_500_000);
    for (let i = 0; i < big.length; i += 1) big[i] = i % 256;

    const encoded = bytesToBase64(big);
    expect(encoded.length).toBe(Math.ceil(big.length / 3) * 4);

    const decoded = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
    expect(decoded.length).toBe(big.length);
    expect(decoded[0]).toBe(0);
    expect(decoded[big.length - 1]).toBe(big[big.length - 1]);
  });

  it("produces the same output regardless of chunk boundaries", () => {
    // 8193 bytes straddles the 8KB chunk boundary, where a naive implementation
    // would corrupt the padding between chunks.
    const straddling = new Uint8Array(8193).fill(65);
    const decoded = Uint8Array.from(atob(bytesToBase64(straddling)), (c) => c.charCodeAt(0));
    expect(decoded).toEqual(straddling);
  });
});

describe("isWithinAttachmentLimit", () => {
  it("accepts a normal invoice PDF", () => {
    expect(isWithinAttachmentLimit(48 * 1024)).toBe(true);
  });

  it("accepts exactly the cap and rejects one byte over", () => {
    expect(isWithinAttachmentLimit(MAX_ATTACHMENT_BYTES)).toBe(true);
    expect(isWithinAttachmentLimit(MAX_ATTACHMENT_BYTES + 1)).toBe(false);
  });

  it("rejects an empty file", () => {
    expect(isWithinAttachmentLimit(0)).toBe(false);
  });

  it("stays well under the 40MB Resend ceiling after base64 inflation", () => {
    expect(MAX_ATTACHMENT_BYTES * (4 / 3)).toBeLessThan(40 * 1024 * 1024);
  });
});
