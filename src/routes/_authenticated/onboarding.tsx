import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfile } from "@/lib/api/profile.functions";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up PaidChase" },
      { name: "description", content: "Tell PaidChase who you are so reminders sound like you." },
      { property: "og:title", content: "Set up PaidChase" },
      { property: "og:description", content: "Tell PaidChase who you are so reminders sound like you." },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const saveProfile = useServerFn(updateProfile);
  const [form, setForm] = useState({
    business_name: "",
    sender_name: "",
    currency: "USD" as (typeof SUPPORTED_CURRENCIES)[number],
  });

  const mutation = useMutation({
    mutationFn: () => saveProfile({ data: form }),
    onSuccess: () => navigate({ to: "/dashboard" }),
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save your details.")),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <form
        className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-6"
        onSubmit={(e) => {
          e.preventDefault();
          mutation.mutate();
        }}
      >
        <div>
          <h1 className="text-lg font-semibold">Welcome to PaidChase</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Two quick details and your reminders are ready to go.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="business_name">Business name</Label>
          <Input
            id="business_name"
            value={form.business_name}
            onChange={(e) => setForm({ ...form, business_name: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sender_name">Your name</Label>
          <Input
            id="sender_name"
            value={form.sender_name}
            onChange={(e) => setForm({ ...form, sender_name: e.target.value })}
            required
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
        <Button type="submit" className="w-full" disabled={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Continue"}
        </Button>
      </form>
    </div>
  );
}
