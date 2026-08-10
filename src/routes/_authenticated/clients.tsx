import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClient,
  deleteClient,
  listClients,
  updateClient,
} from "@/lib/api/clients.functions";
import { formatMoney } from "@/lib/currency";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({
    meta: [
      { title: "Clients — PaidChase" },
      { name: "description", content: "Manage the clients PaidChase sends payment reminders to." },
      { property: "og:title", content: "Clients — PaidChase" },
      { property: "og:description", content: "Manage the clients PaidChase sends payment reminders to." },
    ],
  }),
  component: Clients,
});

type ClientForm = {
  name: string;
  email: string;
  company: string;
  phone: string;
  notes: string;
};

const emptyForm: ClientForm = { name: "", email: "", company: "", phone: "", notes: "" };

function clientStats(
  invoices: { amount: number | string; status: string; due_date: string; currency?: string }[],
) {
  const open = invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled");
  const outstanding = open.reduce((sum, i) => sum + Number(i.amount), 0);
  const last = [...invoices].sort((a, b) => b.due_date.localeCompare(a.due_date))[0];
  const paidCount = invoices.filter((i) => i.status === "paid").length;
  return {
    count: invoices.length,
    outstanding,
    lastDue: last?.due_date,
    paidCount,
  };
}

function Clients() {
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(listClients);
  const addClient = useServerFn(createClient);
  const saveClient = useServerFn(updateClient);
  const removeClient = useServerFn(deleteClient);
  const { data = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });

  const [form, setForm] = useState<ClientForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () =>
      addClient({
        data: {
          name: form.name,
          email: form.email,
          company: form.company || null,
          phone: form.phone || null,
          notes: form.notes || null,
        },
      }),
    onSuccess: () => {
      toast.success("Client added.");
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not add that client.")),
  });

  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editingId) throw new Error("No client selected");
      return saveClient({
        data: {
          id: editingId,
          values: {
            name: form.name,
            email: form.email,
            company: form.company || null,
            phone: form.phone || null,
            notes: form.notes || null,
          },
        },
      });
    },
    onSuccess: () => {
      toast.success("Client updated.");
      setEditingId(null);
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save this client.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => removeClient({ data: { id } }),
    onSuccess: () => {
      toast.success("Client deleted.");
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not delete this client.")),
  });

  return (
    <AppShell>
      <PageHeader title="Clients" description="Who gets the reminders." />

      <form
        className="mb-6 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (editingId) updateMutation.mutate();
          else createMutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="company">Company</Label>
          <Input
            id="company"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone</Label>
          <Input
            id="phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            rows={2}
          />
        </div>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
            {editingId
              ? updateMutation.isPending
                ? "Saving…"
                : "Save client"
              : createMutation.isPending
                ? "Saving…"
                : "Add client"}
          </Button>
          {editingId ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setEditingId(null);
                setForm(emptyForm);
              }}
            >
              Cancel edit
            </Button>
          ) : null}
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <EmptyState title="No clients yet" description="Add a client above to start invoicing them." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((client) => {
            const invoices = client.invoices ?? [];
            const stats = clientStats(invoices);
            const currency =
              invoices.find((i) => i.currency)?.currency ?? "USD";
            return (
              <li key={client.id} className="flex flex-wrap items-start justify-between gap-4 px-4 py-4">
                <div>
                  <p className="text-sm font-medium">{client.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {client.email}
                    {client.company ? ` · ${client.company}` : ""}
                    {client.phone ? ` · ${client.phone}` : ""}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {stats.count} invoice{stats.count === 1 ? "" : "s"} · outstanding{" "}
                    {formatMoney(stats.outstanding, currency)} · {stats.paidCount} paid
                    {stats.lastDue ? ` · last due ${stats.lastDue}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/invoices/new" search={{ clientId: client.id }}>
                      New invoice
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(client.id);
                      setForm({
                        name: client.name,
                        email: client.email ?? "",
                        company: client.company ?? "",
                        phone: client.phone ?? "",
                        notes: client.notes ?? "",
                      });
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (confirm(`Delete ${client.name}?`)) deleteMutation.mutate(client.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </AppShell>
  );
}
