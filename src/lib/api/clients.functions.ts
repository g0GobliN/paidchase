import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { clientInputSchema } from "@/lib/validation";

export const listClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("clients")
      .select(
        "id, name, company, email, phone, notes, is_demo, created_at, invoices(id, amount, currency, status, due_date, invoice_number, paid_at)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load clients");
    return data ?? [];
  });

export const getClient = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { data: client, error } = await context.supabase
      .from("clients")
      .select(
        "id, name, company, email, phone, notes, created_at, invoices(id, invoice_number, amount, currency, status, due_date, paid_at)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error || !client) throw new Error("Client not found");
    return client;
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => clientInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: created, error } = await context.supabase
      .from("clients")
      .insert({
        user_id: context.userId,
        name: data.name,
        company: data.company || null,
        email: data.email || null,
        phone: data.phone || null,
        notes: data.notes || null,
      })
      .select("id, name")
      .single();
    if (error || !created) throw new Error("Could not create this client.");
    return created;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string; values: unknown }) => ({
    id: data.id,
    values: clientInputSchema.parse(data.values),
  }))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("clients")
      .update({
        name: data.values.name,
        company: data.values.company || null,
        email: data.values.email || null,
        phone: data.values.phone || null,
        notes: data.values.notes || null,
      })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not save this client.");
    return { ok: true };
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { count } = await context.supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("client_id", data.id);
    if ((count ?? 0) > 0) throw new Error("Delete this client's invoices first.");
    const { error } = await context.supabase
      .from("clients")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not delete this client.");
    return { ok: true };
  });
