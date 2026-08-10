import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { profileInputSchema } from "@/lib/validation";

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select(
        "id, business_name, sender_name, email, currency, default_sequence_id, onboarding_completed",
      )
      .eq("user_id", context.userId)
      .maybeSingle();

    if (data) return data;

    const { data: created, error } = await context.supabase
      .from("profiles")
      .insert({ user_id: context.userId })
      .select(
        "id, business_name, sender_name, email, currency, default_sequence_id, onboarding_completed",
      )
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
      .select("id, name, type, description, reminder_steps(id, step_order, offset_days, offset_type, subject, body)")
      .order("name");
    if (error) throw new Error("Could not load reminder sequences");
    return data ?? [];
  });
