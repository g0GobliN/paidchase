import { createFileRoute } from "@tanstack/react-router";

import { authorizeWorkerRequest } from "@/lib/reminders/worker-auth";

/**
 * Reminder worker endpoint.
 *
 * Trigger it from any scheduler (pg_cron, Cloudflare Cron, GitHub Actions, ...):
 *   POST /api/public/hooks/process-reminders
 *   headers: { "x-worker-secret": "<WORKER_SECRET>" }
 *
 * Processing is idempotent — reminders are claimed with a conditional update,
 * so overlapping runs never send the same email twice.
 */
export const Route = createFileRoute("/api/public/hooks/process-reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = authorizeWorkerRequest(request.headers, process.env["WORKER_SECRET"]);
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error }), {
            status: auth.status,
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
