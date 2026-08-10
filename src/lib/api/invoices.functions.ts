import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { invoiceInputSchema } from "@/lib/validation";
import {
  assertOwnedInvoice,
  cancelFutureReminders,
  createInvoiceRecord,
  nextInvoiceNumber,
  recordEvent,
  scheduleReminders,
} from "@/lib/invoices/service.server";

export const getNextInvoiceNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => ({
    invoice_number: await nextInvoiceNumber(context.supabase, context.userId),
  }));

export const listInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount, currency, due_date, issue_date, status, paid_at, is_demo, description, clients(id, name, company, email), invoice_reminders(id, scheduled_at, status)",
      )
      .order("due_date", { ascending: true });
    if (error) throw new Error("Could not load invoices");
    return data ?? [];
  });

export const getInvoice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: invoice, error } = await context.supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount, currency, description, issue_date, due_date, status, pdf_path, paid_at, paused_at, sequence_id, clients(id, name, company, email, phone), reminder_sequences(id, name, type)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !invoice) throw new Error("Invoice not found");

    const [{ data: reminders }, { data: events }] = await Promise.all([
      context.supabase
        .from("invoice_reminders")
        .select("id, sequence_step, scheduled_at, sent_at, status, email_subject, error_message")
        .eq("invoice_id", data.id)
        .order("scheduled_at"),
      context.supabase
        .from("invoice_events")
        .select("id, event_type, metadata, created_at")
        .eq("invoice_id", data.id)
        .order("created_at"),
    ]);

    return { invoice, reminders: reminders ?? [], events: events ?? [] };
  });

export const createInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invoice: unknown; send?: boolean }) => ({
    invoice: invoiceInputSchema.parse(data.invoice),
    send: Boolean(data.send),
  }))
  .handler(async ({ data, context }) => {
    const id = await createInvoiceRecord(context.supabase, context.userId, {
      ...data.invoice,
      send: data.send,
    });
    return { id };
  });

export const sendInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const invoice = await assertOwnedInvoice(context.supabase, context.userId, data.id);
    if (invoice.status !== "draft") throw new Error("Only draft invoices can be sent.");
    await context.supabase.from("invoices").update({ status: "scheduled" }).eq("id", data.id);
    await recordEvent(context.supabase, context.userId, data.id, "invoice_sent");
    const scheduled = await scheduleReminders(context.supabase, context.userId, data.id);
    return { scheduled };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnedInvoice(context.supabase, context.userId, data.id);
    const { error } = await context.supabase
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.id);
    if (error) throw new Error("Could not mark this invoice as paid.");
    await cancelFutureReminders(context.supabase, data.id, "Invoice marked as paid");
    await recordEvent(context.supabase, context.userId, data.id, "invoice_paid");
    return { ok: true };
  });

export const pauseInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const invoice = await assertOwnedInvoice(context.supabase, context.userId, data.id);
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      throw new Error("This invoice is already closed.");
    }
    await context.supabase
      .from("invoices")
      .update({ status: "paused", paused_at: new Date().toISOString() })
      .eq("id", data.id);
    await cancelFutureReminders(context.supabase, data.id, "Reminders paused");
    await recordEvent(context.supabase, context.userId, data.id, "invoice_paused");
    return { ok: true };
  });

export const resumeInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const invoice = await assertOwnedInvoice(context.supabase, context.userId, data.id);
    if (invoice.status !== "paused") throw new Error("This invoice is not paused.");
    await context.supabase
      .from("invoices")
      .update({ status: "sent", paused_at: null })
      .eq("id", data.id);
    const scheduled = await scheduleReminders(context.supabase, context.userId, data.id);
    await recordEvent(context.supabase, context.userId, data.id, "invoice_resumed", { scheduled });
    return { scheduled };
  });

export const cancelInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnedInvoice(context.supabase, context.userId, data.id);
    await context.supabase.from("invoices").update({ status: "cancelled" }).eq("id", data.id);
    await cancelFutureReminders(context.supabase, data.id, "Invoice cancelled");
    await recordEvent(context.supabase, context.userId, data.id, "invoice_cancelled");
    return { ok: true };
  });

export const deleteInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    await assertOwnedInvoice(context.supabase, context.userId, data.id);
    const { error } = await context.supabase.from("invoices").delete().eq("id", data.id);
    if (error) throw new Error("Could not delete this invoice.");
    return { ok: true };
  });

export const retryReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { reminderId: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: reminder } = await context.supabase
      .from("invoice_reminders")
      .select("id, user_id, status")
      .eq("id", data.reminderId)
      .maybeSingle();
    if (!reminder || reminder.user_id !== context.userId) throw new Error("Reminder not found");
    if (reminder.status !== "failed") throw new Error("Only failed reminders can be retried.");

    await context.supabase
      .from("invoice_reminders")
      .update({ status: "scheduled", scheduled_at: new Date().toISOString(), error_message: null })
      .eq("id", data.reminderId);

    const { processReminder } = await import("@/lib/reminders/processor.server");
    const result = await processReminder(data.reminderId);
    return result;
  });

export const getInvoicePdfUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: invoice } = await context.supabase
      .from("invoices")
      .select("id, user_id, pdf_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!invoice || invoice.user_id !== context.userId) throw new Error("Invoice not found");
    if (!invoice.pdf_path) throw new Error("This invoice has no attached file.");

    const { data: signed, error } = await context.supabase.storage
      .from("invoice-pdfs")
      .createSignedUrl(invoice.pdf_path, 300);
    if (error || !signed) throw new Error("This invoice file is no longer available.");
    return { url: signed.signedUrl };
  });
