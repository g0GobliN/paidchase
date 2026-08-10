import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/api/clients.functions";
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
  const addClient = useServerFn(createClient);
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    business_name: "",
    sender_name: "",
    currency: "USD" as (typeof SUPPORTED_CURRENCIES)[number],
  });
  const [client, setClient] = useState({ name: "", email: "", company: "" });
  const [createdClientId, setCreatedClientId] = useState<string | null>(null);

  const profileMutation = useMutation({
    mutationFn: () => saveProfile({ data: form }),
    onSuccess: () => setStep(3),
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save your details.")),
  });

  const clientMutation = useMutation({
    mutationFn: () =>
      addClient({
        data: {
          name: client.name,
          email: client.email,
          company: client.company || null,
          phone: null,
          notes: null,
        },
      }),
    onSuccess: (created) => {
      setCreatedClientId(created.id);
      setStep(4);
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not add that client.")),
  });

  const finishMutation = useMutation({
    mutationFn: () => saveProfile({ data: { onboarding_completed: true } }),
    onSuccess: () => {
      toast.success("PaidChase is ready. We'll handle the follow-ups from here.");
      if (createdClientId) {
        navigate({ to: "/invoices/new", search: { clientId: createdClientId } });
      } else {
        navigate({ to: "/dashboard" });
      }
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not finish setup.")),
  });

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md space-y-4 rounded-lg border border-border bg-background p-6">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Step {step} of 4</p>

        {step === 1 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setStep(2);
            }}
          >
            <div>
              <h1 className="text-lg font-semibold">What&apos;s your business name?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Shown on invoices and reminders.</p>
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
            <Button type="submit" className="w-full">
              Continue
            </Button>
          </form>
        ) : null}

        {step === 2 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              profileMutation.mutate();
            }}
          >
            <div>
              <h1 className="text-lg font-semibold">What&apos;s your name?</h1>
              <p className="mt-1 text-sm text-muted-foreground">Used as the sender on follow-ups.</p>
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
                onChange={(e) =>
                  setForm({
                    ...form,
                    currency: e.target.value as (typeof SUPPORTED_CURRENCIES)[number],
                  })
                }
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" className="w-full" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button type="submit" className="w-full" disabled={profileMutation.isPending}>
                {profileMutation.isPending ? "Saving…" : "Continue"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 3 ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              clientMutation.mutate();
            }}
          >
            <div>
              <h1 className="text-lg font-semibold">Add your first client</h1>
              <p className="mt-1 text-sm text-muted-foreground">Optional — you can skip and do this later.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_name">Name</Label>
              <Input
                id="client_name"
                value={client.name}
                onChange={(e) => setClient({ ...client, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_email">Email</Label>
              <Input
                id="client_email"
                type="email"
                value={client.email}
                onChange={(e) => setClient({ ...client, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="client_company">Company</Label>
              <Input
                id="client_company"
                value={client.company}
                onChange={(e) => setClient({ ...client, company: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => setStep(4)}
              >
                Skip
              </Button>
              <Button type="submit" className="w-full" disabled={clientMutation.isPending}>
                {clientMutation.isPending ? "Saving…" : "Continue"}
              </Button>
            </div>
          </form>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <div>
              <h1 className="text-lg font-semibold">Add your first invoice</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                PaidChase is ready. We&apos;ll handle the follow-ups from here.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={finishMutation.isPending}
              onClick={() => finishMutation.mutate()}
            >
              {finishMutation.isPending
                ? "Finishing…"
                : createdClientId
                  ? "Create an invoice"
                  : "Go to dashboard"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              disabled={finishMutation.isPending}
              onClick={() => {
                setCreatedClientId(null);
                finishMutation.mutate();
              }}
            >
              Skip for now
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
