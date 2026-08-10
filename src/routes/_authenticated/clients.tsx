import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { AppShell, EmptyState, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient, listClients } from "@/lib/api/clients.functions";
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

function Clients() {
  const queryClient = useQueryClient();
  const fetchClients = useServerFn(listClients);
  const addClient = useServerFn(createClient);
  const { data = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => fetchClients() });
  const [form, setForm] = useState({ name: "", email: "", company: "" });

  const mutation = useMutation({
    mutationFn: () =>
      addClient({
        data: {
          name: form.name,
          email: form.email,
          company: form.company || null,
          phone: null,
          notes: null,
        },
      }),
    onSuccess: () => {
      toast.success("Client added.");
      setForm({ name: "", email: "", company: "" });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not add that client.")),
  });

  return (
    <AppShell>
      <PageHeader title="Clients" description="Who gets the reminders." />

      <form
        className="mb-6 grid gap-3 rounded-lg border border-border p-4 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
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
        <div className="flex items-end">
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Add client"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : data.length === 0 ? (
        <EmptyState title="No clients yet" description="Add a client above to start invoicing them." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((client) => (
            <li key={client.id} className="px-4 py-3">
              <p className="text-sm font-medium">{client.name}</p>
              <p className="text-xs text-muted-foreground">
                {client.email}
                {client.company ? ` · ${client.company}` : ""}
              </p>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
