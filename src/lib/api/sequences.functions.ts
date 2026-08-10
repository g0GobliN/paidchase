import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Db } from "@/lib/invoices/service.server";

const stepEditSchema = z.object({
  step_order: z.number().int().positive(),
  subject: z.string().trim().min(1, "Subject is required").max(200),
  body: z.string().trim().min(1, "Body is required").max(5000),
});

const saveSchema = z.object({
  sequence_id: z.string().uuid(),
  steps: z.array(stepEditSchema).min(1),
});

/** Invoices in these states can still send, so new wording should reach them. */
const OPEN_INVOICE_STATUSES = ["draft", "scheduled", "sent", "paused"] as const;

/**
 * PostgREST puts `.in()` values in the query string, so an unbounded list becomes
 * an over-long URL and starts returning 414 for heavy users. Chunk it.
 */
const IN_CLAUSE_CHUNK = 200;

export function chunk<T>(items: T[], size = IN_CLAUSE_CHUNK): T[][] {
  if (size < 1) throw new Error("chunk size must be at least 1");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Reminder rows snapshot their subject/body when scheduled, so editing a
 * template does nothing for in-flight invoices unless the snapshot is rewritten.
 * Already-sent reminders keep their original copy — only pending ones are synced.
 */
async function syncPendingReminders(
  supabase: Db,
  userId: string,
  sequenceId: string,
  steps: { id: string; step_order: number; subject: string; body: string }[],
): Promise<number> {
  const { data: invoices } = await supabase
    .from("invoices")
    .select("id")
    .eq("user_id", userId)
    .eq("sequence_id", sequenceId);

  const invoiceIds = (invoices ?? []).map((i) => i.id);
  if (invoiceIds.length === 0) return 0;

  let updated = 0;
  for (const step of steps) {
    for (const batch of chunk(invoiceIds)) {
      const { count } = await supabase
        .from("invoice_reminders")
        .update(
          { step_id: step.id, email_subject: step.subject, email_body: step.body },
          { count: "exact" },
        )
        .eq("user_id", userId)
        .in("invoice_id", batch)
        .eq("sequence_step", step.step_order)
        .in("status", ["scheduled", "failed"]);
      updated += count ?? 0;
    }
  }
  return updated;
}

/**
 * Saves customized email copy for a sequence.
 * System sequences are forked into a personal copy so other users stay untouched.
 */
export const saveSequenceTemplates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => saveSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sequence, error } = await supabase
      .from("reminder_sequences")
      .select(
        "id, user_id, name, type, description, reminder_steps(id, step_order, offset_days, offset_type, subject, body)",
      )
      .eq("id", data.sequence_id)
      .maybeSingle();
    if (error || !sequence) throw new Error("Sequence not found");

    const stepsByOrder = new Map(
      (sequence.reminder_steps ?? []).map((s) => [s.step_order, s] as const),
    );
    for (const edit of data.steps) {
      if (!stepsByOrder.has(edit.step_order)) {
        throw new Error(`Unknown reminder step ${edit.step_order}`);
      }
    }

    // Own sequence — update subjects/bodies in place.
    if (sequence.user_id === userId) {
      for (const edit of data.steps) {
        const step = stepsByOrder.get(edit.step_order)!;
        const { error: updateError } = await supabase
          .from("reminder_steps")
          .update({ subject: edit.subject, body: edit.body })
          .eq("id", step.id);
        if (updateError) throw new Error("Could not save email templates.");
      }

      const remindersUpdated = await syncPendingReminders(
        supabase,
        userId,
        sequence.id,
        data.steps.map((edit) => ({
          id: stepsByOrder.get(edit.step_order)!.id,
          step_order: edit.step_order,
          subject: edit.subject,
          body: edit.body,
        })),
      );

      return {
        sequence_id: sequence.id,
        forked: false,
        invoices_moved: 0,
        reminders_updated: remindersUpdated,
      };
    }

    if (sequence.user_id != null) {
      throw new Error("You can only edit your own sequences.");
    }

    // System sequence — fork into a personal copy.
    const { data: forked, error: forkError } = await supabase
      .from("reminder_sequences")
      .insert({
        user_id: userId,
        name: `${sequence.name} (custom)`,
        type: sequence.type,
        description: sequence.description,
      })
      .select("id")
      .single();
    if (forkError || !forked) throw new Error("Could not create your custom sequence.");

    const editsByOrder = new Map(data.steps.map((s) => [s.step_order, s] as const));
    const rows = (sequence.reminder_steps ?? [])
      .slice()
      .sort((a, b) => a.step_order - b.step_order)
      .map((step) => {
        const edit = editsByOrder.get(step.step_order);
        return {
          sequence_id: forked.id,
          step_order: step.step_order,
          offset_days: step.offset_days,
          offset_type: step.offset_type,
          subject: edit?.subject ?? step.subject,
          body: edit?.body ?? step.body,
        };
      });

    const { data: forkedSteps, error: stepsError } = await supabase
      .from("reminder_steps")
      .insert(rows)
      .select("id, step_order, subject, body");
    if (stepsError || !forkedSteps) throw new Error("Could not save your custom emails.");

    // Move still-open invoices off the system sequence so the new wording applies
    // to work already in flight. Paid/cancelled invoices keep their history.
    const { data: moved } = await supabase
      .from("invoices")
      .update({ sequence_id: forked.id })
      .eq("user_id", userId)
      .eq("sequence_id", sequence.id)
      .in("status", OPEN_INVOICE_STATUSES)
      .select("id");

    const remindersUpdated = await syncPendingReminders(supabase, userId, forked.id, forkedSteps);

    // Prefer the new sequence as default if they were on the system one (or had none).
    const { data: profile } = await supabase
      .from("profiles")
      .select("default_sequence_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile?.default_sequence_id || profile.default_sequence_id === sequence.id) {
      await supabase
        .from("profiles")
        .update({ default_sequence_id: forked.id })
        .eq("user_id", userId);
    }

    return {
      sequence_id: forked.id,
      forked: true,
      invoices_moved: moved?.length ?? 0,
      reminders_updated: remindersUpdated,
    };
  });

export const resetSequenceToDefault = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { sequence_id: string }) => ({
    sequence_id: z.string().uuid().parse(data.sequence_id),
  }))
  .handler(async ({ data, context }) => {
    const { data: sequence } = await context.supabase
      .from("reminder_sequences")
      .select("id, user_id, type")
      .eq("id", data.sequence_id)
      .maybeSingle();
    if (!sequence || sequence.user_id !== context.userId) {
      throw new Error("Only your custom sequences can be deleted.");
    }

    // Point invoices still using this sequence at the matching system sequence if possible.
    const { data: system } = await context.supabase
      .from("reminder_sequences")
      .select("id")
      .is("user_id", null)
      .eq("type", sequence.type)
      .limit(1);
    let fallbackId = system?.[0]?.id ?? null;
    if (!fallbackId) {
      const { data: standard } = await context.supabase
        .from("reminder_sequences")
        .select("id")
        .is("user_id", null)
        .eq("type", "standard")
        .limit(1);
      fallbackId = standard?.[0]?.id ?? null;
    }

    if (fallbackId) {
      await context.supabase
        .from("invoices")
        .update({ sequence_id: fallbackId })
        .eq("user_id", context.userId)
        .eq("sequence_id", sequence.id);
      await context.supabase
        .from("profiles")
        .update({ default_sequence_id: fallbackId })
        .eq("user_id", context.userId)
        .eq("default_sequence_id", sequence.id);

      // Put the default wording back on pending reminders before the custom
      // steps are deleted out from under them.
      const { data: systemSteps } = await context.supabase
        .from("reminder_steps")
        .select("id, step_order, subject, body")
        .eq("sequence_id", fallbackId);
      if (systemSteps?.length) {
        await syncPendingReminders(context.supabase, context.userId, fallbackId, systemSteps);
      }
    }

    const { error } = await context.supabase
      .from("reminder_sequences")
      .delete()
      .eq("id", sequence.id)
      .eq("user_id", context.userId);
    if (error) throw new Error("Could not remove this custom sequence.");
    return { ok: true, fallback_id: fallbackId };
  });
