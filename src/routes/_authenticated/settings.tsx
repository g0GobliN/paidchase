import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getProfile, updateProfile } from "@/lib/api/profile.functions";
import { firstErrorMessage } from "@/lib/validation";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";

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
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });

  const [form, setForm] = useState({
    business_name: "",
    sender_name: "",
    currency: "USD" as (typeof SUPPORTED_CURRENCIES)[number],
  });

  useEffect(() => {
    if (!data) return;
    setForm({
      business_name: data.business_name ?? "",
      sender_name: data.sender_name ?? "",
      currency: (data.currency ?? "USD") as (typeof SUPPORTED_CURRENCIES)[number],
    });
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => saveProfile({ data: form }),
    onSuccess: () => {
      toast.success("Settings saved.");
      queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save your settings.")),
  });

  return (
    <AppShell>
      <PageHeader title="Settings" description="These details appear on invoices and reminder emails." />
      <form
        className="max-w-xl space-y-4 rounded-lg border border-border p-5"
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
          <Label htmlFor="currency">Default currency</Label>
          <select
            id="currency"
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={form.currency}
            onChange={(e) => setForm({ ...form, currency: e.target.value as (typeof SUPPORTED_CURRENCIES)[number] })}
          >
            {SUPPORTED_CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Save settings"}
        </Button>
      </form>
    </AppShell>
  );
}
