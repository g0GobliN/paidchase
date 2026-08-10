export type ReminderStepLike = {
  id: string;
  step_order: number;
  offset_days: number;
  offset_type: string;
  subject: string;
  body: string;
};

export type PlannedReminder = {
  step_id: string;
  sequence_step: number;
  scheduled_at: string;
  subject: string;
  body: string;
  /** True when this row stands in for one or more already-missed steps. */
  catch_up?: boolean;
};

/** Reminders are sent at 09:00 UTC on their target day. */
export const SEND_HOUR_UTC = 9;

export function stepSendTime(dueDate: string, offsetDays: number): Date {
  const base = new Date(`${dueDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + offsetDays);
  base.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);
  return base;
}

/**
 * Pure scheduling calculation.
 *
 * Steps whose send time has already passed are NOT dropped — an invoice that is
 * already overdue when it is added is the single most common reason someone signs
 * up, and silently scheduling nothing made the product look broken. Instead every
 * missed step collapses into one immediate catch-up send carrying the most
 * escalated copy that applies, and future steps schedule normally.
 *
 * Collapsing matters: firing five back-dated emails at once would be worse than
 * sending none. One correctly-toned message is the right recovery.
 */
export function planReminders(
  dueDate: string,
  steps: ReminderStepLike[],
  now: Date = new Date(),
): PlannedReminder[] {
  const planned: PlannedReminder[] = steps
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      step_id: step.id,
      sequence_step: step.step_order,
      scheduled_at: stepSendTime(dueDate, step.offset_days).toISOString(),
      subject: step.subject,
      body: step.body,
    }));

  const nowMs = now.getTime();
  const future = planned.filter((p) => new Date(p.scheduled_at).getTime() > nowMs);
  const missed = planned.filter((p) => new Date(p.scheduled_at).getTime() <= nowMs);

  if (missed.length === 0) return future;

  const mostEscalated = missed[missed.length - 1]!;
  return [
    { ...mostEscalated, scheduled_at: new Date(nowMs).toISOString(), catch_up: true },
    ...future,
  ];
}
