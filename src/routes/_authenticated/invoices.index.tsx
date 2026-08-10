import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import {
  listInvoices,
  markInvoicePaid,
  pauseInvoice,
  resumeInvoice,
} from "@/lib/api/invoices.functions";
import { formatMoney } from "@/lib/currency";
import { derivedStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { formatDueDate } from "@/lib/templates";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/invoices/")({
  head: () => ({
    meta: [
      { title: "Invoices — PaidChase" },
      { name: "description", content: "All your invoices and their reminder status in one list." },
      { property: "og:title", content: "Invoices — PaidChase" },
      { property: "og:description", content: "All your invoices and their reminder status in one list." },
    ],
  }),
  component: InvoicesIndex,
});

function nextReminderLabel(
  reminders: { scheduled_at: string; status: string }[] | null | undefined,
) {
  const next = (reminders ?? [])
    .filter((r) => r.status === "scheduled")
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
  return next ? formatDueDate(next.scheduled_at.slice(0, 10)) : "—";
}

function InvoicesIndex() {
  const queryClient = useQueryClient();
  const fetchInvoices = useServerFn(listInvoices);
  const doPaid = useServerFn(markInvoicePaid);
  const doPause = useServerFn(pauseInvoice);
  const doResume = useServerFn(resumeInvoice);
  const { data = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });

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
        title="Invoices"
        description="Every invoice PaidChase is watching."
        action={
          <Button asChild size="sm">
            <Link to="/invoices/new">New invoice</Link>
          </Button>
        }
      />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Once you add an invoice it shows up here with its reminder schedule."
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
                <th className="px-4 py-3 font-medium">Due</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Next reminder</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-surface/60">
                  <td className="px-4 py-3">
                    <Link
                      to="/invoices/$invoiceId"
                      params={{ invoiceId: invoice.id }}
                      className="font-medium hover:underline"
                    >
                      {invoice.clients?.name ?? "Client"}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{invoice.invoice_number}</td>
                  <td className="px-4 py-3 font-mono">
                    {formatMoney(invoice.amount, invoice.currency)}
                  </td>
                  <td className="px-4 py-3">{formatDueDate(invoice.due_date)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={derivedStatus(invoice.status as InvoiceStatus, invoice.due_date)} />
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
                      ) : invoice.status !== "draft" &&
                        invoice.status !== "paid" &&
                        invoice.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: invoice.id, kind: "pause" })}
                        >
                          Pause
                        </Button>
                      ) : null}
                      {invoice.status !== "paid" && invoice.status !== "cancelled" ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={action.isPending}
                          onClick={() => action.mutate({ id: invoice.id, kind: "paid" })}
                        >
                          Paid
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppShell>
  );
}
