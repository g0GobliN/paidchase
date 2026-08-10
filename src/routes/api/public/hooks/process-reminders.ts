import { createFileRoute } from "@tanstack/react-router";

/**
 * Reminder worker endpoint.
 *
 * Trigger it from any scheduler (pg_cron, Cloudflare Cron, GitHub Actions, ...):
 *   POST /api/public/hooks/process-reminders
 *   headers: { "apikey": "<supabase publishable key>" }
 *
 * Processing is idempotent — reminders are claimed with a conditional update,
 * so overlapping runs never send the same email twice.
 */
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expectedKey =
          process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["SUPABASE_ANON_KEY"];
        const providedKey =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer /, "");

        if (!expectedKey || providedKey !== expectedKey) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { processDueReminders } = await import("@/lib/reminders/processor.server");
          const result = await processDueReminders(100);
          console.log("[reminders] processed", {
            found: result.found,
            sent: result.sent,
            failed: result.failed,
            skipped: result.skipped,
          });
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[reminders] worker error", error);
          return new Response(JSON.stringify({ ok: false, error: "Processing failed" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
