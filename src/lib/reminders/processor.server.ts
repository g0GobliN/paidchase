import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createEmailService } from "@/lib/email/service.server";
import { buildTemplateVariables, renderTemplate, textToHtml } from "@/lib/templates";
import { canReceiveReminders, type InvoiceStatus } from "@/lib/invoice-status";

export type ProcessResult = {
  found: number;
  sent: number;
  failed: number;
  skipped: number;
  details: { reminder_id: string; outcome: string; error?: string }[];
};

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
  const result: ProcessResult = { found: 0, sent: 0, failed: 0, skipped: 0, details: [] };
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
      "id, user_id, invoice_number, amount, currency, due_date, status, client_id, clients(name, company, email)",
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
    await failReminder(claimed.id, "Add a client email before scheduling reminders.");
    return { outcome: "failed", error: "missing client email" };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("business_name, sender_name, email")
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
  });

  const subject = renderTemplate(claimed.email_subject ?? "Invoice {{invoice_number}}", vars);
  const body = renderTemplate(claimed.email_body ?? "", vars);

  // 3. Send through the provider abstraction.
  const sendResult = await createEmailService().send({
    to: client.email,
    subject,
    text: body,
    html: textToHtml(body),
    ...(profile?.email ? { replyTo: profile.email } : {}),
  });

  if (!sendResult.ok) {
    await failReminder(claimed.id, sendResult.error);
    await recordEvent(claimed.user_id, invoice.id, "reminder_failed", {
      sequence_step: claimed.sequence_step,
      error: sendResult.error,
    });
    return { outcome: "failed", error: sendResult.error };
  }

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
    .eq("id", claimed.id);

  await recordEvent(claimed.user_id, invoice.id, "reminder_sent", {
    sequence_step: claimed.sequence_step,
    subject,
  });

  return { outcome: "sent" };
}

async function failReminder(id: string, message: string) {
  const { data } = await supabaseAdmin
    .from("invoice_reminders")
    .select("attempts")
    .eq("id", id)
    .maybeSingle();
  await supabaseAdmin
    .from("invoice_reminders")
    .update({ status: "failed", error_message: message, attempts: (data?.attempts ?? 0) + 1 })
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
