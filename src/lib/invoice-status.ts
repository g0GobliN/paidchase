export type InvoiceStatus = "draft" | "scheduled" | "sent" | "paid" | "paused" | "cancelled";
export type DerivedStatus = InvoiceStatus | "due_soon" | "overdue";

export const REMINDABLE_STATUSES: InvoiceStatus[] = ["scheduled", "sent"];

/** Backend truth: an invoice can only receive reminders in these states. */
export function canReceiveReminders(status: InvoiceStatus): boolean {
  return REMINDABLE_STATUSES.includes(status);
}

export function daysUntil(dueDate: string, now = new Date()): number {
  const due = new Date(`${dueDate}T00:00:00Z`).getTime();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((due - today) / 86_400_000);
}

/** UI-only derived state. The database column stays the source of truth. */
export function derivedStatus(
  status: InvoiceStatus,
  dueDate: string,
  now = new Date(),
): DerivedStatus {
  if (status === "paid" || status === "paused" || status === "cancelled" || status === "draft") {
    return status;
  }
  const days = daysUntil(dueDate, now);
  if (days < 0) return "overdue";
  if (days <= 3) return "due_soon";
  return status;
}

export const STATUS_LABELS: Record<DerivedStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  sent: "Sent",
  due_soon: "Due soon",
  overdue: "Overdue",
  paid: "Paid",
  paused: "Paused",
  cancelled: "Cancelled",
};
