import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { bytesToBase64, isWithinAttachmentLimit } from "@/lib/email/base64";
import { createEmailService } from "@/lib/email/service.server";
import type { EmailAttachment } from "@/lib/email/types";
import { isPathOwnedBy } from "@/lib/invoices/pdf-path";
import { buildTemplateVariables, renderBody, renderSubject, textToHtml } from "@/lib/templates";
import { canReceiveReminders, type InvoiceStatus } from "@/lib/invoice-status";

export type ProcessResult = {
  found: number;
  sent: number;
  failed: number;
  skipped: number;
  reclaimed: number;
  details: { reminder_id: string; outcome: string; error?: string }[];
};

/** A reminder claimed longer ago than this is assumed abandoned by a dead worker. */
export const STUCK_CLAIM_MS = 10 * 60_000;

/** Give up after this many attempts so a permanently broken address stops cycling. */
export const MAX_ATTEMPTS = 4;

/** Backoff before re-queueing a transient failure, indexed by attempts so far. */
export function retryDelayMs(attempts: number): number {
  const ladder = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
  return ladder[Math.min(attempts, ladder.length - 1)] ?? 0;
}

type ReminderRow = {
  id: string;
  user_id: string;
  invoice_id: string;
  sequence_step: number;
  email_subject: string | null;
  email_body: string | null;
};

/**
 * Processes every reminder that is due.
 *
 * Idempotency: each reminder is claimed with a conditional update
 * (`status = 'scheduled'` -> `'processing'`). Only the worker that wins that
 * update sends the email, so duplicate/parallel runs can never double-send.
 */
export async function processDueReminders(limit = 50): Promise<ProcessResult> {
  const result: ProcessResult = {
    found: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    reclaimed: 0,
    details: [],
  };
  result.reclaimed = await reclaimStuckReminders();
  const nowIso = new Date().toISOString();

  const { data: due, error } = await supabaseAdmin
    .from("invoice_reminders")
    .select("id, user_id, invoice_id, sequence_step, email_subject, email_body")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowIso)
    .order("scheduled_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[reminders] failed to load due reminders", error);
    throw new Error("Could not load due reminders");
  }

  result.found = due?.length ?? 0;
  for (const reminder of (due ?? []) as ReminderRow[]) {
    const outcome = await processReminder(reminder.id);
    if (outcome.outcome === "sent") result.sent += 1;
    else if (outcome.outcome === "failed") result.failed += 1;
    else result.skipped += 1;
    result.details.push({ reminder_id: reminder.id, ...outcome });
  }

  return result;
}

/**
 * Returns reminders abandoned mid-flight to the queue.
 *
 * A worker that dies between claiming a row and writing the outcome leaves it in
 * `processing` forever: the due query only looks at `scheduled`, the retry button
 * only accepts `failed`, and rescheduling only clears `scheduled`/`cancelled`.
 * Without this the reminder is simply lost. `updated_at` is maintained by a table
 * trigger, so it doubles as the claim timestamp.
 */
async function reclaimStuckReminders(): Promise<number> {
  const cutoff = new Date(Date.now() - STUCK_CLAIM_MS).toISOString();
  const { data, error } = await supabaseAdmin
    .from("invoice_reminders")
    .update({ status: "scheduled" })
    .eq("status", "processing")
    .lt("updated_at", cutoff)
    .select("id");

  if (error) {
    console.error("[reminders] failed to reclaim stuck reminders", error);
    return 0;
  }
  if (data?.length) {
    console.warn(`[reminders] reclaimed ${data.length} stuck reminder(s)`);
  }
  return data?.length ?? 0;
}

/** A download that hangs must not eat the batch's time budget. */
const ATTACHMENT_DOWNLOAD_TIMEOUT_MS = 10_000;

/**
 * Fetches the invoice PDF for attaching to a reminder.
 *
 * Never throws: the email matters more than the attachment, so every failure path
 * returns a reason and lets the send proceed without it. The reason is recorded on the
 * `reminder_sent` event so a silently missing PDF is visible in the timeline.
 */
async function loadInvoiceAttachment(
  pdfPath: string | null,
  userId: string,
  meta: { invoiceNumber: string },
): Promise<{ file?: EmailAttachment; skipped?: string }> {
  if (!pdfPath) return { skipped: "no file attached" };

  // The service-role client bypasses storage RLS, so ownership is re-checked here even
  // though createInvoiceRecord and setInvoicePdfPath already validate on write.
  if (!isPathOwnedBy(pdfPath, userId)) {
    console.error(`[reminders] refusing foreign pdf_path for user ${userId}`);
    return { skipped: "invalid file path" };
  }

  try {
    const { data, error } = await Promise.race([
      supabaseAdmin.storage.from("invoice-pdfs").download(pdfPath),
      new Promise<{ data: null; error: Error }>((resolve) =>
        setTimeout(
          () => resolve({ data: null, error: new Error("timeout") }),
          ATTACHMENT_DOWNLOAD_TIMEOUT_MS,
        ),
      ),
    ]);

    if (error || !data) return { skipped: "download failed" };

    const bytes = new Uint8Array(await data.arrayBuffer());
    if (!isWithinAttachmentLimit(bytes.byteLength)) {
      return { skipped: `file too large (${bytes.byteLength} bytes)` };
    }

    return {
      file: {
        filename: `${meta.invoiceNumber}.pdf`,
        content: bytesToBase64(bytes),
        contentType: "application/pdf",
      },
    };
  } catch (error) {
    console.error("[reminders] attachment download error", error);
    return { skipped: "download error" };
  }
}

/** Processes a single reminder by id. Safe to call concurrently. */
export async function processReminder(
  reminderId: string,
): Promise<{ outcome: "sent" | "failed" | "skipped"; error?: string }> {
  // 1. Atomically claim the reminder. Losing this race means another worker has it.
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("invoice_reminders")
    .update({ status: "processing" })
    .eq("id", reminderId)
    .eq("status", "scheduled")
    .select("id, user_id, invoice_id, sequence_step, email_subject, email_body, attempts")
    .maybeSingle();

  if (claimError) {
    console.error("[reminders] claim failed", claimError);
    return { outcome: "skipped", error: "claim failed" };
  }
  if (!claimed) return { outcome: "skipped", error: "already claimed or not scheduled" };

  // 2. Re-verify invoice state server-side.
  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, user_id, invoice_number, amount, currency, due_date, status, client_id, pdf_path, clients(name, company, email)",
    )
    .eq("id", claimed.invoice_id)
    .maybeSingle();

  if (!invoice || invoice.user_id !== claimed.user_id) {
    await cancelReminder(claimed.id, "Invoice no longer available");
    return { outcome: "skipped", error: "invoice missing" };
  }

  if (!canReceiveReminders(invoice.status as InvoiceStatus)) {
    await cancelReminder(claimed.id, `Invoice is ${invoice.status}`);
    return { outcome: "skipped", error: `invoice ${invoice.status}` };
  }

  const client = (invoice as unknown as { clients: { name: string; company: string | null; email: string | null } | null })
    .clients;

  if (!client?.email) {
    await failReminder(
      claimed.id,
      "Add a client email before scheduling reminders.",
      (claimed.attempts ?? 0) + 1,
    );
    return { outcome: "failed", error: "missing client email" };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("business_name, sender_name, email, payment_instructions")
    .eq("user_id", claimed.user_id)
    .maybeSingle();

  const vars = buildTemplateVariables({
    clientName: client.name,
    clientCompany: client.company,
    invoiceNumber: invoice.invoice_number,
    amount: invoice.amount as unknown as number,
    currency: invoice.currency,
    dueDate: invoice.due_date,
    businessName: profile?.business_name ?? null,
    senderName: profile?.sender_name ?? null,
    paymentInstructions: profile?.payment_instructions ?? null,
  });

  const subject = renderSubject(claimed.email_subject ?? "Invoice {{invoice_number}}", vars);
  const body = renderBody(claimed.email_body ?? "", vars);

  // 3. Attach the invoice itself. A chase that says "see the invoice" is useless if the
  //    recipient never got one — but a missing attachment must never block the chase.
  const attachment = await loadInvoiceAttachment(invoice.pdf_path, invoice.user_id, {
    invoiceNumber: invoice.invoice_number,
  });

  // 4. Send through the provider abstraction.
  const sendResult = await createEmailService().send({
    to: client.email,
    subject,
    text: body,
    html: textToHtml(body),
    ...(profile?.email ? { replyTo: profile.email } : {}),
    ...(attachment.file ? { attachments: [attachment.file] } : {}),
  });

  if (!sendResult.ok) {
    const attempts = (claimed.attempts ?? 0) + 1;
    const willRetry = sendResult.retryable && attempts < MAX_ATTEMPTS;

    if (willRetry) {
      await supabaseAdmin
        .from("invoice_reminders")
        .update({
          status: "scheduled",
          scheduled_at: new Date(Date.now() + retryDelayMs(attempts - 1)).toISOString(),
          error_message: sendResult.error,
          attempts,
        })
        .eq("id", claimed.id);
      return { outcome: "skipped", error: `retrying: ${sendResult.error}` };
    }

    await failReminder(claimed.id, sendResult.error, attempts);
    await recordEvent(claimed.user_id, invoice.id, "reminder_failed", {
      sequence_step: claimed.sequence_step,
      error: sendResult.error,
      attempts,
    });
    return { outcome: "failed", error: sendResult.error };
  }

  // Only overwrite a row we still own. If the invoice was marked paid while the
  // send was in flight, cancelFutureReminders has already set this to `cancelled`
  // and that verdict must stand — otherwise the timeline would claim we sent a
  // reminder the user had explicitly stopped.
  await supabaseAdmin
    .from("invoice_reminders")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: sendResult.providerMessageId,
      error_message: null,
      attempts: (claimed.attempts ?? 0) + 1,
      email_subject: subject,
      email_body: body,
    })
    .eq("id", claimed.id)
    .eq("status", "processing");

  await recordEvent(claimed.user_id, invoice.id, "reminder_sent", {
    sequence_step: claimed.sequence_step,
    subject,
    pdf_attached: Boolean(attachment.file),
    ...(attachment.skipped ? { pdf_skipped_reason: attachment.skipped } : {}),
  });

  return { outcome: "sent" };
}

async function failReminder(id: string, message: string, attempts: number) {
  await supabaseAdmin
    .from("invoice_reminders")
    .update({ status: "failed", error_message: message, attempts })
    .eq("id", id);
}

async function cancelReminder(id: string, message: string) {
  await supabaseAdmin
    .from("invoice_reminders")
    .update({ status: "cancelled", error_message: message })
    .eq("id", id);
}

async function recordEvent(
  userId: string,
  invoiceId: string,
  eventType: string,
  metadata: Record<string, string | number | boolean | null>,
) {
  await supabaseAdmin
    .from("invoice_events")
    .insert({ user_id: userId, invoice_id: invoiceId, event_type: eventType, metadata });
}
