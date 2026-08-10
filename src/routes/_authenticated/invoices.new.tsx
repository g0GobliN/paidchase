import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createInvoice, getNextInvoiceNumber } from "@/lib/api/invoices.functions";
import { createClient, listClients } from "@/lib/api/clients.functions";
import { getProfile, listSequences } from "@/lib/api/profile.functions";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { generateInvoicePdf } from "@/lib/invoices/pdf";
import { uploadInvoicePdf } from "@/lib/invoices/storage";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/invoices/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    clientId: typeof search.clientId === "string" ? search.clientId : undefined,
  }),
  head: () => ({
    meta: [
      { title: "New invoice — PaidChase" },
      { name: "description", content: "Create an invoice and choose how PaidChase should follow up." },
    ],
  }),
  component: NewInvoice,
});

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function NewInvoice() {
  const { clientId } = useSearch({ from: "/_authenticated/invoices/new" });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const fetchNumber = useServerFn(getNextInvoiceNumber);
  const fetchClients = useServerFn(listClients);
  const fetchSequences = useServerFn(listSequences);
  const fetchProfile = useServerFn(getProfile);
  const addInvoice = useServerFn(createInvoice);
  const addClient = useServerFn(createClient);

  const { data: numberData } = useQuery({
    queryKey: ["next-invoice-number"],
    queryFn: () => fetchNumber(),
  });
  const { data: clients = [], refetch: refetchClients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => fetchClients(),
  });
  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences"],
    queryFn: () => fetchSequences(),
  });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [form, setForm] = useState({
    client_id: "",
    invoice_number: "",
    amount: "",
    currency: "USD" as (typeof SUPPORTED_CURRENCIES)[number],
    description: "",
    issue_date: todayIso(),
    due_date: todayIso(),
    sequence_id: "",
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [generatePdf, setGeneratePdf] = useState(true);
  const [showNewClient, setShowNewClient] = useState(false);
  const [newClient, setNewClient] = useState({ name: "", email: "", company: "" });

  useEffect(() => {
    if (numberData?.invoice_number) {
      setForm((f) => (f.invoice_number ? f : { ...f, invoice_number: numberData.invoice_number }));
    }
  }, [numberData]);

  useEffect(() => {
    if (clientId) setForm((f) => ({ ...f, client_id: clientId }));
  }, [clientId]);

  useEffect(() => {
    if (!profile) return;
    setForm((f) => ({
      ...f,
      currency: (profile.currency ?? "USD") as (typeof SUPPORTED_CURRENCIES)[number],
      sequence_id: profile.default_sequence_id ?? f.sequence_id,
    }));
  }, [profile]);

  useEffect(() => {
    if (form.sequence_id || sequences.length === 0) return;
    const standard = sequences.find((s) => s.type === "standard");
    setForm((f) => ({ ...f, sequence_id: standard?.id ?? sequences[0]!.id }));
  }, [sequences, form.sequence_id]);

  const createClientMutation = useMutation({
    mutationFn: () =>
      addClient({
        data: {
          name: newClient.name,
          email: newClient.email,
          company: newClient.company || null,
          phone: null,
          notes: null,
        },
      }),
    onSuccess: async (created) => {
      toast.success("Client added.");
      setShowNewClient(false);
      setNewClient({ name: "", email: "", company: "" });
      await refetchClients();
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setForm((f) => ({ ...f, client_id: created.id }));
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not add that client.")),
  });

  const mutation = useMutation({
    mutationFn: async (send: boolean) => {
      const client = clients.find((c) => c.id === form.client_id);
      if (!client) throw new Error("Select a client");

      let pdf_path: string | null = null;
      if (pdfFile) {
        pdf_path = await uploadInvoicePdf(pdfFile, pdfFile.name);
      } else if (generatePdf) {
        const blob = generateInvoicePdf({
          businessName: profile?.business_name ?? "",
          senderEmail: profile?.email ?? "",
          clientName: client.name,
          clientEmail: client.email ?? "",
          invoiceNumber: form.invoice_number,
          issueDate: form.issue_date,
          dueDate: form.due_date,
          description: form.description,
          amount: Number(form.amount),
          currency: form.currency,
          paymentInstructions: profile?.payment_instructions ?? "",
        });
        pdf_path = await uploadInvoicePdf(blob, `${form.invoice_number}.pdf`);
      }

      return addInvoice({
        data: {
          send,
          invoice: {
            client_id: form.client_id,
            invoice_number: form.invoice_number,
            amount: Number(form.amount),
            currency: form.currency,
            description: form.description || null,
            issue_date: form.issue_date,
            due_date: form.due_date,
            sequence_id: form.sequence_id || null,
            pdf_path,
          },
        },
      });
    },
    onSuccess: async (result, send) => {
      toast.success(send ? "Invoice scheduled — reminders are set." : "Draft saved.");
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      navigate({ to: "/invoices/$invoiceId", params: { invoiceId: result.id } });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not create the invoice.")),
  });

  return (
    <AppShell>
      <PageHeader
        title="New invoice"
        description="Add the details once. PaidChase handles the follow-ups."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/invoices">Back</Link>
          </Button>
        }
      />

      <form
        className="max-w-2xl space-y-4 rounded-lg border border-border p-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate(true);
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="client_id">Client</Label>
          <select
            id="client_id"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.client_id}
            onChange={(e) => setForm({ ...form, client_id: e.target.value })}
            required={!showNewClient}
            disabled={showNewClient}
          >
            <option value="">Select a client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.email ? ` · ${c.email}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="text-xs text-muted-foreground underline underline-offset-2"
            onClick={() => setShowNewClient((v) => !v)}
          >
            {showNewClient ? "Use existing client" : "Create a new client"}
          </button>
        </div>

        {showNewClient ? (
          <div className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="new_client_name">Name</Label>
              <Input
                id="new_client_name"
                value={newClient.name}
                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_client_email">Email</Label>
              <Input
                id="new_client_email"
                type="email"
                value={newClient.email}
                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="new_client_company">Company</Label>
              <Input
                id="new_client_company"
                value={newClient.company}
                onChange={(e) => setNewClient({ ...newClient, company: e.target.value })}
              />
            </div>
            <div className="sm:col-span-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={createClientMutation.isPending}
                onClick={() => createClientMutation.mutate()}
              >
                {createClientMutation.isPending ? "Saving…" : "Save client"}
              </Button>
            </div>
          </div>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="invoice_number">Invoice number</Label>
            <Input
              id="invoice_number"
              value={form.invoice_number}
              onChange={(e) => setForm({ ...form, invoice_number: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="amount">Amount</Label>
            <Input
              id="amount"
              type="number"
              min="0.01"
              step="0.01"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.currency}
              onChange={(e) =>
                setForm({ ...form, currency: e.target.value as (typeof SUPPORTED_CURRENCIES)[number] })
              }
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="issue_date">Issue date</Label>
            <Input
              id="issue_date"
              type="date"
              value={form.issue_date}
              onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="due_date">Due date</Label>
            <Input
              id="due_date"
              type="date"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
              required
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            placeholder="Website design and development"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sequence_id">Reminder sequence</Label>
          <select
            id="sequence_id"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.sequence_id}
            onChange={(e) => setForm({ ...form, sequence_id: e.target.value })}
            required
          >
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.description ? ` — ${s.description}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3 rounded-md border border-border p-3">
          <p className="text-sm font-medium">Invoice PDF</p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={generatePdf && !pdfFile}
              onChange={(e) => {
                setGeneratePdf(e.target.checked);
                if (e.target.checked) setPdfFile(null);
              }}
            />
            Generate a simple PDF
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="pdf">Or upload your own</Label>
            <Input
              id="pdf"
              type="file"
              accept="application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] ?? null;
                setPdfFile(file);
                if (file) setGeneratePdf(false);
              }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Save & schedule reminders"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate(false)}
          >
            Save as draft
          </Button>
        </div>
      </form>
    </AppShell>
  );
}
