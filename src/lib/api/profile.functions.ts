import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { profileInputSchema } from "@/lib/validation";

/** Shared so the read and the lazy-create can never drift apart. */
const PROFILE_COLUMNS =
  "id, business_name, sender_name, email, currency, default_sequence_id, onboarding_completed, payment_instructions";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("user_id", context.userId)
      .maybeSingle();

    if (data) return data;

    const { data: created, error } = await context.supabase
      .from("profiles")
      .insert({ user_id: context.userId })
      .select(PROFILE_COLUMNS)
      .single();
    if (error || !created) throw new Error("Could not load your profile.");
    return created;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => profileInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("profiles")
      .update({
        ...(data.business_name !== undefined ? { business_name: data.business_name || null } : {}),
        ...(data.sender_name !== undefined ? { sender_name: data.sender_name || null } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.currency !== undefined ? { currency: data.currency } : {}),
        ...(data.default_sequence_id !== undefined
          ? { default_sequence_id: data.default_sequence_id }
          : {}),
        ...(data.onboarding_completed !== undefined
          ? { onboarding_completed: data.onboarding_completed }
          : {}),
        ...(data.payment_instructions !== undefined
          ? { payment_instructions: data.payment_instructions || null }
          : {}),
      })
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not save your settings.");
    return { ok: true };
  });

export const listSequences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("reminder_sequences")
      .select("id, user_id, name, type, description, reminder_steps(id, step_order, offset_days, offset_type, subject, body)")
      .order("name");
    if (error) throw new Error("Could not load reminder sequences");
    return data ?? [];
  });

/** Deletes the signed-in user's app data, then the auth user. Irreversible. */
export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;

    // Every delete below runs as service role. The user-scoped client cannot do
    // this job: `subscriptions` grants only SELECT to `authenticated`, so the old
    // user-scoped delete silently matched zero rows and returned no error, and
    // the auth user was destroyed anyway — orphaning billing state and leaving
    // data behind that we had told the user was erased.
    let cursor: string | undefined;
    for (;;) {
      const { data: files, error: listError } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .list(userId, { limit: 100, ...(cursor ? { offset: Number(cursor) } : {}) });
      if (listError) throw new Error("Could not remove your invoice files. Nothing was deleted.");
      if (!files?.length) break;

      const { error: removeError } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) {
        throw new Error("Could not remove your invoice files. Nothing was deleted.");
      }
      if (files.length < 100) break;
      cursor = String(Number(cursor ?? 0) + files.length);
    }

    // Order matters: invoices reference clients with ON DELETE RESTRICT.
    const tables = [
      "invoice_reminders",
      "invoice_events",
      "invoices",
      "clients",
      "subscriptions",
      "profiles",
    ] as const;

    for (const table of tables) {
      const { error: deleteError } = await supabaseAdmin.from(table).delete().eq("user_id", userId);
      if (deleteError) {
        console.error(`[deleteAccount] failed to clear ${table}`, deleteError);
        throw new Error("Could not fully delete your data. Your account is unchanged.");
      }
    }

    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error("Could not delete your account. Check SUPABASE_SERVICE_ROLE_KEY.");
    return { ok: true };
  });
