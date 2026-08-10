import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { listInvoices } from "@/lib/api/invoices.functions";
import { formatMoney } from "@/lib/currency";
import { derivedStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { formatDueDate } from "@/lib/templates";

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

function Dashboard() {
  const fetchInvoices = useServerFn(listInvoices);
  const { data = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });

  const outstanding = data.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const overdue = outstanding.filter(
    (i) => derivedStatus(i.status as InvoiceStatus, i.due_date) === "overdue",
  );
  const total = outstanding.reduce((sum, i) => sum + Number(i.amount), 0);
  const currency = outstanding[0]?.currency ?? "USD";

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

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          ["Outstanding", formatMoney(total, currency)],
          ["Open invoices", String(outstanding.length)],
          ["Overdue", String(overdue.length)],
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
        <ul className="divide-y divide-border rounded-lg border border-border">
          {outstanding.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <Link
                  to="/invoices/$invoiceId"
                  params={{ invoiceId: invoice.id }}
                  className="text-sm font-medium hover:underline"
                >
                  {invoice.invoice_number} · {invoice.clients?.name ?? "Client"}
                </Link>
                <p className="text-xs text-muted-foreground">Due {formatDueDate(invoice.due_date)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">
                  {formatMoney(invoice.amount, invoice.currency)}
                </span>
                <StatusBadge status={derivedStatus(invoice.status as InvoiceStatus, invoice.due_date)} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
