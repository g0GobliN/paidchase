import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell, PageHeader } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { listSequences } from "@/lib/api/profile.functions";
import { resetSequenceToDefault, saveSequenceTemplates } from "@/lib/api/sequences.functions";
import { TEMPLATE_VARIABLE_NAMES } from "@/lib/templates";
import { firstErrorMessage } from "@/lib/validation";

export const Route = createFileRoute("/_authenticated/templates")({
  head: () => ({
    meta: [
      { title: "Email templates — PaidChase" },
      {
        name: "description",
        content: "Customize the payment reminder emails your clients receive.",
      },
    ],
  }),
  component: TemplatesPage,
});

type StepDraft = {
  step_order: number;
  offset_days: number;
  offset_type: string;
  subject: string;
  body: string;
};

function timingLabel(offsetDays: number, offsetType: string) {
  if (offsetType === "on_due" || offsetDays === 0) return "On due date";
  if (offsetDays < 0) return `${Math.abs(offsetDays)} day(s) before due`;
  return `${offsetDays} day(s) after due`;
}

function TemplatesPage() {
  const queryClient = useQueryClient();
  const fetchSequences = useServerFn(listSequences);
  const saveTemplates = useServerFn(saveSequenceTemplates);
  const resetSequence = useServerFn(resetSequenceToDefault);

  const { data: sequences = [], isLoading } = useQuery({
    queryKey: ["sequences"],
    queryFn: () => fetchSequences(),
  });

  const [selectedId, setSelectedId] = useState("");
  const [drafts, setDrafts] = useState<StepDraft[]>([]);

  const selected = useMemo(
    () => sequences.find((s) => s.id === selectedId) ?? null,
    [sequences, selectedId],
  );

  useEffect(() => {
    if (!selectedId && sequences[0]) setSelectedId(sequences[0].id);
  }, [sequences, selectedId]);

  useEffect(() => {
    if (!selected) {
      setDrafts([]);
      return;
    }
    const steps = [...(selected.reminder_steps ?? [])].sort(
      (a, b) => a.step_order - b.step_order,
    );
    setDrafts(
      steps.map((s) => ({
        step_order: s.step_order,
        offset_days: s.offset_days,
        offset_type: s.offset_type,
        subject: s.subject,
        body: s.body,
      })),
    );
  }, [selected]);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveTemplates({
        data: {
          sequence_id: selectedId,
          steps: drafts.map(({ step_order, subject, body }) => ({
            step_order,
            subject,
            body,
          })),
        },
      }),
    onSuccess: async (result) => {
      const moved = result.invoices_moved
        ? ` ${result.invoices_moved} open invoice${result.invoices_moved === 1 ? "" : "s"} moved over.`
        : "";
      const synced = result.reminders_updated
        ? ` ${result.reminders_updated} pending reminder${result.reminders_updated === 1 ? "" : "s"} updated.`
        : "";
      toast.success(
        (result.forked ? "Saved as your custom sequence." : "Email templates saved.") +
          moved +
          synced,
      );
      await queryClient.invalidateQueries({ queryKey: ["sequences"] });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelectedId(result.sequence_id);
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not save templates.")),
  });

  const resetMutation = useMutation({
    mutationFn: () => resetSequence({ data: { sequence_id: selectedId } }),
    onSuccess: async (result) => {
      toast.success("Reverted to the default PaidChase emails.");
      await queryClient.invalidateQueries({ queryKey: ["sequences"] });
      await queryClient.invalidateQueries({ queryKey: ["profile"] });
      await queryClient.invalidateQueries({ queryKey: ["invoices"] });
      if (result.fallback_id) setSelectedId(result.fallback_id);
    },
    onError: (error) => toast.error(firstErrorMessage(error, "Could not reset templates.")),
  });

  const isCustom = Boolean(selected && selected.user_id);

  return (
    <AppShell>
      <PageHeader
        title="Email templates"
        description="Write reminders in your voice. Merge fields fill in client and invoice details automatically."
      />

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-6">
          <div className="max-w-xl space-y-1.5">
            <Label htmlFor="sequence">Sequence</Label>
            <select
              id="sequence"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
            >
              {sequences.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.user_id ? " · yours" : " · default"}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Editing a default sequence creates your own copy. Timing stays the same — only the
              wording changes.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {TEMPLATE_VARIABLE_NAMES.map((name) => (
              <code
                key={name}
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {`{{${name}}}`}
              </code>
            ))}
          </div>

          <div className="space-y-4">
            {drafts.map((step, index) => (
              <div key={step.step_order} className="space-y-3 rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">Reminder {step.step_order}</p>
                  <p className="text-xs text-muted-foreground">
                    {timingLabel(step.offset_days, step.offset_type)}
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`subject-${step.step_order}`}>Subject</Label>
                  <Input
                    id={`subject-${step.step_order}`}
                    value={step.subject}
                    onChange={(e) => {
                      const next = [...drafts];
                      next[index] = { ...step, subject: e.target.value };
                      setDrafts(next);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`body-${step.step_order}`}>Body</Label>
                  <Textarea
                    id={`body-${step.step_order}`}
                    rows={6}
                    value={step.body}
                    onChange={(e) => {
                      const next = [...drafts];
                      next[index] = { ...step, body: e.target.value };
                      setDrafts(next);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={saveMutation.isPending || drafts.length === 0}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Saving…" : "Save templates"}
            </Button>
            {isCustom ? (
              <Button
                type="button"
                variant="outline"
                disabled={resetMutation.isPending}
                onClick={() => {
                  if (confirm("Delete this custom sequence and use PaidChase defaults again?")) {
                    resetMutation.mutate();
                  }
                }}
              >
                {resetMutation.isPending ? "Resetting…" : "Reset to default"}
              </Button>
            ) : null}
            <Button asChild type="button" variant="ghost">
              <Link to="/settings">Back to settings</Link>
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
