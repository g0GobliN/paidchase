import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  cancelInvoice,
  getInvoice,
  getInvoicePdfUrl,
  markInvoicePaid,
  pauseInvoice,
  resumeInvoice,
  retryReminder,
  sendInvoice,
  setInvoicePdfPath,
} from "@/lib/api/invoices.functions";
import { formatMoney } from "@/lib/currency";
import { derivedStatus, type InvoiceStatus } from "@/lib/invoice-status";
import { uploadInvoicePdf } from "@/lib/invoices/storage";
import { formatDueDate } from "@/lib/templates";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/invoices/$invoiceId")({
  head: () => ({
    meta: [
      { title: "Invoice — PaidChase" },
      { name: "description", content: "Invoice timeline, reminders, and payment status." },
    ],
  }),
  component: InvoiceDetail,
});

const EVENT_LABELS: Record<string, string> = {
  invoice_created: "Invoice created",
  invoice_sent: "Invoice sent",
  invoice_paid: "Marked paid",
  invoice_paused: "Reminders paused",
  invoice_resumed: "Reminders resumed",
  invoice_cancelled: "Invoice cancelled",
  reminder_sent: "Reminder sent",
  reminder_failed: "Reminder failed",
  pdf_attached: "PDF attached",
};

function InvoiceDetail() {
  const { invoiceId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchInvoice = useServerFn(getInvoice);
  const doSend = useServerFn(sendInvoice);
  const doPaid = useServerFn(markInvoicePaid);
  const doPause = useServerFn(pauseInvoice);
  const doResume = useServerFn(resumeInvoice);
  const doCancel = useServerFn(cancelInvoice);
  const doRetry = useServerFn(retryReminder);
  const doPdfUrl = useServerFn(getInvoicePdfUrl);
  const doSetPdf = useServerFn(setInvoicePdfPath);

  const { data, isLoading, error } = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => fetchInvoice({ data: { id: invoiceId } }),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
  }

  const action = useMutation({
    mutationFn: async (kind: "send" | "paid" | "pause" | "resume" | "cancel") => {
      if (kind === "send") return doSend({ data: { id: invoiceId } });
      if (kind === "paid") {
        if (!confirm("Mark this invoice as paid? All future reminders will stop.")) {
          throw new Error("Cancelled");
        }
        return doPaid({ data: { id: invoiceId } });
      }
      if (kind === "pause") return doPause({ data: { id: invoiceId } });
      if (kind === "resume") return doResume({ data: { id: invoiceId } });
      if (!confirm("Cancel this invoice and stop all reminders?")) throw new Error("Cancelled");
      return doCancel({ data: { id: invoiceId } });
    },
    onSuccess: (_, kind) => {
      toast.success(
        kind === "paid"
          ? "Marked paid — reminders stopped."
          : kind === "pause"
            ? "Reminders paused."
            : kind === "resume"
              ? "Reminders resumed."
              : kind === "send"
                ? "Invoice scheduled."
                : "Invoice cancelled.",
      );
      invalidate();
    },
    onError: (err) => {
      if (err instanceof Error && err.message === "Cancelled") return;
      toast.error(firstErrorMessage(err));
    },
  });

  const retry = useMutation({
    mutationFn: (reminderId: string) => doRetry({ data: { reminderId } }),
    onSuccess: () => {
      toast.success("Retry queued.");
      invalidate();
    },
    onError: (err) => toast.error(firstErrorMessage(err)),
  });

  const openPdf = useMutation({
    mutationFn: () => doPdfUrl({ data: { id: invoiceId } }),
    onSuccess: ({ url }) => window.open(url, "_blank", "noopener,noreferrer"),
    onError: (err) => toast.error(firstErrorMessage(err)),
  });

  const uploadPdf = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadInvoicePdf(file, file.name);
      await doSetPdf({ data: { id: invoiceId, pdf_path: path } });
    },
    onSuccess: () => {
      toast.success("PDF attached.");
      invalidate();
    },
    onError: (err) => toast.error(firstErrorMessage(err)),
  });

  if (isLoading) {
    return (
      <AppShell>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <PageHeader title="Invoice not found" description="It may have been deleted." />
        <Button asChild variant="outline" size="sm">
          <Link to="/invoices">Back to invoices</Link>
        </Button>
      </AppShell>
    );
  }

  const { invoice, reminders, events } = data;
  const status = derivedStatus(invoice.status as InvoiceStatus, invoice.due_date);
  const closed = invoice.status === "paid" || invoice.status === "cancelled";

  return (
    <AppShell>
      <PageHeader
        title={invoice.invoice_number}
        description={`${invoice.clients?.name ?? "Client"} · due ${formatDueDate(invoice.due_date)}`}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/invoices">Back</Link>
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <StatusBadge status={status} />
        <span className="font-mono text-lg font-semibold">
          {formatMoney(invoice.amount, invoice.currency)}
        </span>
        {invoice.reminder_sequences?.name ? (
          <span className="text-sm text-muted-foreground">{invoice.reminder_sequences.name} sequence</span>
        ) : null}
      </div>

      <div className="mb-8 flex flex-wrap gap-2">
        {invoice.status === "draft" ? (
          <Button size="sm" disabled={action.isPending} onClick={() => action.mutate("send")}>
            Schedule reminders
          </Button>
        ) : null}
        {!closed ? (
          <Button size="sm" disabled={action.isPending} onClick={() => action.mutate("paid")}>
            Mark as paid
          </Button>
        ) : null}
        {invoice.status === "paused" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate("resume")}
          >
            Resume reminders
          </Button>
        ) : !closed && invoice.status !== "draft" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={action.isPending}
            onClick={() => action.mutate("pause")}
          >
            Pause reminders
          </Button>
        ) : null}
        {!closed ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={action.isPending}
            onClick={() => action.mutate("cancel")}
          >
            Cancel invoice
          </Button>
        ) : null}
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h2 className="mb-3 text-sm font-medium">Details</h2>
          <dl className="space-y-2 rounded-lg border border-border p-4 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Client</dt>
              <dd>{invoice.clients?.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd>{invoice.clients?.email || "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Issued</dt>
              <dd>{formatDueDate(invoice.issue_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Due</dt>
              <dd>{formatDueDate(invoice.due_date)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Description</dt>
              <dd className="max-w-[60%] text-right">{invoice.description || "—"}</dd>
            </div>
          </dl>

          <div className="mt-4 space-y-2 rounded-lg border border-border p-4">
            <p className="text-sm font-medium">PDF</p>
            {invoice.pdf_path ? (
              <Button size="sm" variant="outline" disabled={openPdf.isPending} onClick={() => openPdf.mutate()}>
                {openPdf.isPending ? "Opening…" : "View PDF"}
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">No file attached yet.</p>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="attach-pdf">Attach PDF</Label>
              <Input
                id="attach-pdf"
                type="file"
                accept="application/pdf"
                disabled={uploadPdf.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadPdf.mutate(file);
                }}
              />
            </div>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium">Timeline</h2>
          <ol className="space-y-3 rounded-lg border border-border p-4">
            {events.map((event) => (
              <li key={event.id} className="text-sm">
                <p className="font-medium">{EVENT_LABELS[event.event_type] ?? event.event_type}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </li>
            ))}
            {reminders.map((reminder) => (
              <li key={reminder.id} className="text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      Reminder {reminder.sequence_step}
                      {reminder.email_subject ? ` — ${reminder.email_subject}` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {reminder.status === "sent" && reminder.sent_at
                        ? `Sent ${new Date(reminder.sent_at).toLocaleString()}`
                        : reminder.status === "failed"
                          ? `Failed — ${reminder.error_message ?? "unknown error"}`
                          : reminder.status === "cancelled"
                            ? "Cancelled"
                            : `Scheduled — ${new Date(reminder.scheduled_at).toLocaleString()}`}
                    </p>
                  </div>
                  {reminder.status === "failed" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(reminder.id)}
                    >
                      Retry
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
            {events.length === 0 && reminders.length === 0 ? (
              <li className="text-sm text-muted-foreground">No timeline yet.</li>
            ) : null}
          </ol>
        </section>
      </div>

      <div className="mt-8">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/invoices" })}>
          Back to invoices
        </Button>
      </div>
    </AppShell>
  );
}
