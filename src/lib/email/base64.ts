/**
 * Base64 for email attachments.
 *
 * Deliberately does not use Node's `Buffer`: `src/server.ts` exports a Workers-shaped
 * `{ fetch(request, env, ctx) }` entry, so this has to run on a runtime where only
 * `btoa` and the Web APIs are guaranteed.
 */

/**
 * Resend accepts up to 40MB per message after base64 encoding, which inflates by ~4/3.
 * This cap is far below that: it bounds worst-case worker memory and keeps a batch of
 * reminders from blowing its time budget on one oversized upload.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** Chunk small enough that the spread into `String.fromCharCode` cannot overflow the stack. */
const CHUNK_SIZE = 8 * 1024;

/**
 * Encodes bytes as base64.
 *
 * The obvious one-liner — `btoa(String.fromCharCode(...bytes))` — throws
 * "Maximum call stack size exceeded" on files of a few hundred KB, because every byte
 * becomes a separate argument. Chunking keeps each call small.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export function isWithinAttachmentLimit(byteLength: number): boolean {
  return byteLength > 0 && byteLength <= MAX_ATTACHMENT_BYTES;
}
