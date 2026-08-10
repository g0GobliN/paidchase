import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listInvoices, markInvoicePaid, pauseInvoice, resumeInvoice } from "@/lib/api/invoices.functions";
import { formatMoney } from "@/lib/currency";
import { derivedStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { formatDueDate } from "@/lib/templates";
import { firstErrorMessage } from "@/lib/validation";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — PaidChase" },
      { name: "description", content: "Track outstanding invoices and upcoming payment reminders." },
      { property: "og:title", content: "Dashboard — PaidChase" },
      { property: "og:description", content: "Track outstanding invoices and upcoming payment reminders." },
    ],
  }),
  component: Dashboard,
});

function nextReminderLabel(
  reminders: { scheduled_at: string; status: string }[] | null | undefined,
) {
  const next = (reminders ?? [])
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  return next ? formatDueDate(next.scheduled_at.slice(0, 10)) : "—";
}

function Dashboard() {
  const queryClient = useQueryClient();
  const fetchInvoices = useServerFn(listInvoices);
  const doPaid = useServerFn(markInvoicePaid);
  const doPause = useServerFn(pauseInvoice);
  const doResume = useServerFn(resumeInvoice);
  const { data = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });

  const outstanding = data.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const overdue = outstanding.filter(
    (i) => derivedStatus(i.status as InvoiceStatus, i.due_date) === "overdue",
  );
  const total = outstanding.reduce((sum, i) => sum + Number(i.amount), 0);
  const overdueAmount = overdue.reduce((sum, i) => sum + Number(i.amount), 0);
  const now = new Date();
  const paidThisMonth = data
    .filter((i) => {
      if (i.status !== "paid" || !i.paid_at) return false;
      const paid = new Date(i.paid_at);
      return paid.getUTCFullYear() === now.getUTCFullYear() && paid.getUTCMonth() === now.getUTCMonth();
    })
    .reduce((sum, i) => sum + Number(i.amount), 0);
  const currency =
    outstanding[0]?.currency ?? data.find((i) => i.status === "paid")?.currency ?? "USD";

  const action = useMutation({
    mutationFn: async ({ id, kind }: { id: string; kind: "paid" | "pause" | "resume" }) => {
      if (kind === "paid") {
        if (!confirm("Mark this invoice as paid? All future reminders will stop.")) {
          throw new Error("Cancelled");
        }
        return doPaid({ data: { id } });
      }
      if (kind === "resume") return doResume({ data: { id } });
      return doPause({ data: { id } });
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.kind === "paid"
          ? "Marked paid."
          : vars.kind === "resume"
            ? "Reminders resumed."
            : "Reminders paused.",
      );
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "Cancelled") return;
      toast.error(firstErrorMessage(err));
    },
  });

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        description="Everything still waiting to be paid."
        action={
          <Button asChild size="sm">
            <Link to="/invoices/new">New invoice</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Active invoices", String(outstanding.length)],
          ["Total outstanding", formatMoney(total, currency)],
          ["Overdue amount", formatMoney(overdueAmount, currency)],
          ["Paid this month", formatMoney(paidThisMonth, currency)],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-border p-4">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <h2 className="mb-3 mt-8 text-sm font-medium">Active invoices</h2>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : outstanding.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Add your first invoice and PaidChase will handle the follow-ups."
          action={
            <Button asChild size="sm">
              <Link to="/invoices/new">Add invoice</Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[800px] text-left text-sm">
            <thead className="border-b border-border bg-surface text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Invoice</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Due date</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Next reminder</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {outstanding.map((invoice) => {
                const status = derivedStatus(invoice.status as InvoiceStatus, invoice.due_date);
                const isOverdue = status === "overdue";
                return (
                  <tr
                    key={invoice.id}
                    className={cn("hover:bg-surface/60", isOverdue && "bg-destructive/5")}
                  >
                    <td className="px-4 py-3 font-medium">{invoice.clients?.name ?? "Client"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{invoice.invoice_number}</td>
                    <td className="px-4 py-3 font-mono">
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td className="px-4 py-3">{formatDueDate(invoice.due_date)}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {nextReminderLabel(invoice.invoice_reminders)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button asChild size="sm" variant="ghost">
                          <Link to="/invoices/$invoiceId" params={{ invoiceId: invoice.id }}>
                            Details
                          </Link>
                        </Button>
                        {invoice.status === "paused" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.isPending}
                            onClick={() => action.mutate({ id: invoice.id, kind: "resume" })}
                          >
                            Resume
                          </Button>
                        ) : invoice.status !== "draft" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={action.isPending}
                            onClick={() => action.mutate({ id: invoice.id, kind: "pause" })}
                          >
                            Pause
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: invoice.id, kind: "paid" })}
                        >
                          Paid
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
