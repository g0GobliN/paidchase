import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isPathOwnedBy } from "@/lib/invoices/pdf-path";
import { planReminders, type ReminderStepLike } from "@/lib/reminders/schedule";
import { canReceiveReminders, type InvoiceStatus } from "@/lib/invoice-status";
import type { InvoiceInput } from "@/lib/validation";

export type Db = SupabaseClient<Database>;

export async function recordEvent(
  supabase: Db,
  userId: string,
  invoiceId: string,
  eventType: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  await supabase
    .from("invoice_events")
    .insert({ user_id: userId, invoice_id: invoiceId, event_type: eventType, metadata });
}

export async function nextInvoiceNumber(supabase: Db, userId: string): Promise<string> {
  const { data } = await supabase
    .from("invoices")
    .select("invoice_number")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  let max = 0;
  for (const row of data ?? []) {
    const match = /INV-(\d+)/i.exec(row.invoice_number);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `INV-${String(max + 1).padStart(4, "0")}`;
}

/** Removes not-yet-sent reminders for an invoice. */
export async function cancelFutureReminders(supabase: Db, invoiceId: string, reason: string) {
  await supabase
    .from("invoice_reminders")
    .update({ status: "cancelled", error_message: reason })
    .eq("invoice_id", invoiceId)
    .in("status", ["scheduled", "processing"]);
}

/** (Re)builds the reminder schedule for an invoice from its sequence. */
export async function scheduleReminders(
  supabase: Db,
  userId: string,
  invoiceId: string,
): Promise<number> {
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, user_id, due_date, status, sequence_id")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice || invoice.user_id !== userId) throw new Error("Invoice not found");
  if (!invoice.sequence_id) return 0;
  if (!canReceiveReminders(invoice.status as InvoiceStatus)) return 0;

  const { data: steps } = await supabase
    .from("reminder_steps")
    .select("id, step_order, offset_days, offset_type, subject, body")
    .eq("sequence_id", invoice.sequence_id)
    .order("step_order");

  const planned = planReminders(invoice.due_date, (steps ?? []) as ReminderStepLike[]);

  // Wipe pending rows so the unique (invoice_id, sequence_step) index stays clean.
  await supabase
    .from("invoice_reminders")
    .delete()
    .eq("invoice_id", invoiceId)
    .in("status", ["scheduled", "cancelled"]);

  if (planned.length === 0) return 0;

  const { error } = await supabase.from("invoice_reminders").insert(
    planned.map((p) => ({
      user_id: userId,
      invoice_id: invoiceId,
      step_id: p.step_id,
      sequence_step: p.sequence_step,
      scheduled_at: p.scheduled_at,
      email_subject: p.subject,
      email_body: p.body,
      status: "scheduled" as const,
    })),
  );
  if (error) throw new Error("Could not schedule reminders");
  return planned.length;
}

export async function assertOwnedInvoice(supabase: Db, userId: string, invoiceId: string) {
  const { data } = await supabase
    .from("invoices")
    .select("id, user_id, status")
    .eq("id", invoiceId)
    .maybeSingle();
  if (!data || data.user_id !== userId) throw new Error("Invoice not found");
  return data;
}

export async function createInvoiceRecord(
  supabase: Db,
  userId: string,
  input: InvoiceInput & { send: boolean },
) {
  const { data: client } = await supabase
    .from("clients")
    .select("id, user_id, email")
    .eq("id", input.client_id)
    .maybeSingle();
  if (!client || client.user_id !== userId) throw new Error("Client not found");
  if (input.send && !client.email) {
    throw new Error("Add a client email before scheduling reminders.");
  }
  if (new Date(input.due_date) < new Date(input.issue_date)) {
    throw new Error("Due date must be on or after the issue date.");
  }
  // The worker downloads this path with the service-role client, which bypasses
  // storage RLS — so ownership has to be proven here, not left to the bucket policy.
  if (input.pdf_path && !isPathOwnedBy(input.pdf_path, userId)) {
    throw new Error("Invalid invoice file path.");
  }

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      user_id: userId,
      client_id: input.client_id,
      sequence_id: input.sequence_id ?? null,
      invoice_number: input.invoice_number,
      amount: input.amount,
      currency: input.currency,
      description: input.description ?? null,
      issue_date: input.issue_date,
      due_date: input.due_date,
      pdf_path: input.pdf_path ?? null,
      status: input.send ? "scheduled" : "draft",
    })
    .select("id")
    .single();

  if (error || !invoice) {
    throw new Error(
      error?.code === "23505"
        ? "That invoice number is already used."
        : "Could not create the invoice.",
    );
  }

  await recordEvent(supabase, userId, invoice.id, "invoice_created");
  if (input.send) {
    await recordEvent(supabase, userId, invoice.id, "invoice_sent");
    await scheduleReminders(supabase, userId, invoice.id);
  }
  return invoice.id;
}
