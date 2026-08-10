import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { removeDemoData, seedDemoData } from "@/lib/api/demo.functions";
import { getProfile, listSequences, updateProfile } from "@/lib/api/profile.functions";
import { firstErrorMessage } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — PaidChase" },
      { name: "description", content: "Business details and payment instructions used in reminders." },
      { property: "og:title", content: "Settings — PaidChase" },
      { property: "og:description", content: "Business details and payment instructions used in reminders." },
    ],
  }),
  component: Settings,
});

function Settings() {
  const queryClient = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const saveProfile = useServerFn(updateProfile);
  const fetchSequences = useServerFn(listSequences);
  const seedDemo = useServerFn(seedDemoData);
  const clearDemo = useServerFn(removeDemoData);

  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const { data: sequences = [] } = useQuery({
    queryKey: ["sequences"],
    queryFn: () => fetchSequences(),
  });

  const [form, setForm] = useState({
    business_name: "",
    sender_name: "",
    email: "",
    currency: "USD" as (typeof SUPPORTED_CURRENCIES)[number],
    default_sequence_id: "" as string | null,
  });
  const [password, setPassword] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({
      business_name: data.business_name ?? "",
      sender_name: data.sender_name ?? "",
      email: data.email ?? "",
      currency: (data.currency ?? "USD") as (typeof SUPPORTED_CURRENCIES)[number],
      default_sequence_id: data.default_sequence_id,
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () =>
      saveProfile({
        data: {
          ...form,
          default_sequence_id: form.default_sequence_id || null,
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save your settings.")),
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      if (password.length < 8) throw new Error("Password must be at least 8 characters.");
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password updated.");
      setPassword("");
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not update password.")),
  });

  const demoSeed = useMutation({
    mutationFn: () => seedDemo(),
    onSuccess: (result) => {
      toast.success(`Demo data added (${result.invoices} invoices).`);
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not add demo data.")),
  });

  const demoClear = useMutation({
    mutationFn: () => clearDemo(),
    onSuccess: () => {
      toast.success("Demo data removed.");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not remove demo data.")),
  });

  return (
    <AppShell>
      <PageHeader title="Settings" description="These details appear on invoices and reminder emails." />

      <form
        className="mb-8 max-w-xl space-y-4 rounded-lg border border-border p-5"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div className="space-y-1.5">
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sender_name">Sender name</Label>
          <Input
            id="sender_name"
            value={form.sender_name}
            onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Sender email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="currency">Default currency</Label>
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
          <Label htmlFor="default_sequence_id">Default reminder sequence</Label>
          <select
            id="default_sequence_id"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.default_sequence_id ?? ""}
            onChange={(e) => setForm({ ...form, default_sequence_id: e.target.value || null })}
          >
            <option value="">No default</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <section className="mb-8 max-w-xl space-y-3 rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Change password</h2>
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={passwordMutation.isPending || password.length < 8}
          onClick={() => passwordMutation.mutate()}
        >
          {passwordMutation.isPending ? "Updating…" : "Update password"}
        </Button>
      </section>

      <section className="max-w-xl space-y-3 rounded-lg border border-border p-5">
        <h2 className="text-sm font-medium">Demo data</h2>
        <p className="text-sm text-muted-foreground">
          Load sample clients and invoices for testing. Easy to remove later.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={demoSeed.isPending}
            onClick={() => demoSeed.mutate()}
          >
            {demoSeed.isPending ? "Adding…" : "Add demo data"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={demoClear.isPending}
            onClick={() => demoClear.mutate()}
          >
            {demoClear.isPending ? "Removing…" : "Remove demo data"}
          </Button>
        </div>
      </section>
    </AppShell>
  );
}
