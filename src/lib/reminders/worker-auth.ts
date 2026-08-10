/**
 * Authentication for the reminder worker endpoint.
 *
 * This deliberately does NOT accept the Supabase publishable key. That key is
 * injected into the browser bundle by Vite (`VITE_SUPABASE_PUBLISHABLE_KEY`), so
 * anyone could read it from the shipped JavaScript and drive the worker. Because
 * a send failure used to be terminal, a flood of unauthorised runs could burn
 * every due reminder in the system. The worker now needs its own private secret
 * that never reaches the client bundle.
 */

export type WorkerAuthResult = { ok: true } | { ok: false; status: 401 | 503; error: string };

/** Constant-time string compare. Length is allowed to leak; contents are not. */
export function secretsMatch(expected: string, provided: string): boolean {
  if (expected.length !== provided.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0;
}

export function extractWorkerSecret(headers: Headers): string | null {
  const direct = headers.get("x-worker-secret");
  if (direct) return direct;
  const auth = headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
  return null;
}

export function authorizeWorkerRequest(
  headers: Headers,
  expectedSecret: string | undefined,
): WorkerAuthResult {
  // Fail closed. A missing secret must never mean "let everyone in".
  if (!expectedSecret) {
    return {
      ok: false,
      status: 503,
      error: "Worker is not configured. Set WORKER_SECRET.",
    };
  }
  const provided = extractWorkerSecret(headers);
  if (!provided || !secretsMatch(expectedSecret, provided)) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  return { ok: true };
}
