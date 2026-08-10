import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { listInvoices } from "@/lib/api/invoices.functions";
import { formatMoney } from "@/lib/currency";
import { derivedStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { formatDueDate } from "@/lib/templates";

export const Route = createFileRoute("/_authenticated/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices — PaidChase" },
      { name: "description", content: "All your invoices and their reminder status in one list." },
      { property: "og:title", content: "Invoices — PaidChase" },
      { property: "og:description", content: "All your invoices and their reminder status in one list." },
    ],
  }),
  component: Invoices,
});

function Invoices() {
  const fetchInvoices = useServerFn(listInvoices);
  const { data = [], isLoading } = useQuery({ queryKey: ["invoices"], queryFn: () => fetchInvoices() });

  return (
    <AppShell>
      <PageHeader title="Invoices" description="Every invoice PaidChase is watching." />
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Once you add an invoice it shows up here with its reminder schedule."
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">
                  {invoice.invoice_number} · {invoice.clients?.name ?? "Client"}
                </p>
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
