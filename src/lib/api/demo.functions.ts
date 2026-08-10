import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { nextInvoiceNumber, recordEvent, scheduleReminders } from "@/lib/invoices/service.server";

const STANDARD = "22222222-2222-4222-8222-222222222222";
const PERSISTENT = "33333333-3333-4333-8333-333333333333";

/** Adds clearly-labelled demo records so a new account isn't empty. Opt-in only. */
export const seedDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date();
    const iso = (offset: number) => {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() + offset);
      return d.toISOString().slice(0, 10);
    };

    const { data: clients, error: clientError } = await supabase
      .from("clients")
      .insert([
        { user_id: userId, name: "Acme Design", company: "Acme Inc.", email: "billing@acme.test", is_demo: true },
        { user_id: userId, name: "John Smith", company: "Smith Consulting", email: "john@smith.test", is_demo: true },
        { user_id: userId, name: "Pixel Studio", company: "Pixel Studio Ltd", email: "accounts@pixel.test", is_demo: true },
      ])
      .select("id, name");
    if (clientError || !clients) throw new Error("Could not create demo data.");

    const byName = (name: string) => clients.find((c) => c.name === name)!.id;
    const base = await nextInvoiceNumber(supabase, userId);
    const startNumber = Number(base.replace("INV-", ""));
    const num = (i: number) => `INV-${String(startNumber + i).padStart(4, "0")}`;

    const { data: invoices, error: invoiceError } = await supabase
      .from("invoices")
      .insert([
        {
          user_id: userId, client_id: byName("Acme Design"), invoice_number: num(0),
          amount: 1200, currency: "USD", description: "Website design and development",
          issue_date: iso(-6), due_date: iso(4), status: "sent" as const,
          sequence_id: STANDARD, is_demo: true,
        },
        {
          user_id: userId, client_id: byName("John Smith"), invoice_number: num(1),
          amount: 450, currency: "USD", description: "Brand consultation session",
          issue_date: iso(-17), due_date: iso(-3), status: "sent" as const,
          sequence_id: PERSISTENT, is_demo: true,
        },
        {
          user_id: userId, client_id: byName("Pixel Studio"), invoice_number: num(2),
          amount: 2500, currency: "USD", description: "Product illustration set",
          issue_date: iso(-40), due_date: iso(-20), status: "paid" as const,
          paid_at: new Date().toISOString(), sequence_id: STANDARD, is_demo: true,
        },
      ])
      .select("id, status");
    if (invoiceError || !invoices) throw new Error("Could not create demo invoices.");

    for (const invoice of invoices) {
      await recordEvent(supabase, userId, invoice.id, "invoice_created");
      if (invoice.status === "sent") {
        await recordEvent(supabase, userId, invoice.id, "invoice_sent");
        await scheduleReminders(supabase, userId, invoice.id);
      } else {
        await recordEvent(supabase, userId, invoice.id, "invoice_paid");
      }
    }

    return { clients: clients.length, invoices: invoices.length };
  });

export const removeDemoData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase.from("invoices").delete().eq("user_id", context.userId).eq("is_demo", true);
    await context.supabase.from("clients").delete().eq("user_id", context.userId).eq("is_demo", true);
    return { ok: true };
  });
