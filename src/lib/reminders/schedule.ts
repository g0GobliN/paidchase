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
 * Pure scheduling calculation. Steps whose send time is already in the past are
 * skipped so resuming or back-dating an invoice never blasts historical emails.
 */
export function planReminders(
  dueDate: string,
  steps: ReminderStepLike[],
  now: Date = new Date(),
): PlannedReminder[] {
  return steps
    .slice()
    .sort((a, b) => a.step_order - b.step_order)
    .map((step) => ({
      step_id: step.id,
      sequence_step: step.step_order,
      scheduled_at: stepSendTime(dueDate, step.offset_days).toISOString(),
      subject: step.subject,
      body: step.body,
    }))
    .filter((planned) => new Date(planned.scheduled_at).getTime() > now.getTime());
}
