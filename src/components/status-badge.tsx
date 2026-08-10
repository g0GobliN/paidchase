import { cn } from "@/lib/utils";
import { STATUS_LABELS, type DerivedStatus } from "@/lib/invoice-status";

const STYLES: Record<DerivedStatus, string> = {
  draft: "bg-secondary text-muted-foreground",
  scheduled: "bg-secondary text-foreground",
  sent: "bg-secondary text-foreground",
  due_soon: "bg-warning/15 text-warning-foreground ring-1 ring-warning/40",
  overdue: "bg-danger/10 text-danger ring-1 ring-danger/30",
  paid: "bg-success/12 text-success ring-1 ring-success/30",
  paused: "bg-secondary text-muted-foreground ring-1 ring-border",
  cancelled: "bg-secondary text-muted-foreground line-through",
};

export function StatusBadge({ status }: { status: DerivedStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        STYLES[status],
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
