import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PaidChase — Automatic invoice payment reminders" },
      {
        name: "description",
        content:
          "PaidChase sends polite payment reminders for freelancers and small businesses, automatically, until the invoice is paid.",
      },
      { property: "og:title", content: "PaidChase — Automatic invoice payment reminders" },
      {
        property: "og:description",
        content: "Send an invoice. Forget it. PaidChase chases until you're paid.",
      },
    ],
  }),
  component: Landing,
});

const FAQ = [
  {
    q: "Does PaidChase process payments?",
    a: "No. Clients pay you the way they always have. PaidChase only tracks whether payment arrived and stops chasing once you mark the invoice paid.",
  },
  {
    q: "Can I upload an existing invoice?",
    a: "Yes. Attach your own PDF, or let PaidChase generate a simple one for you.",
  },
  {
    q: "Can I stop reminders?",
    a: "Any invoice can be paused, resumed or cancelled at any time. Paused invoices never send reminders.",
  },
  {
    q: "What happens when a client pays?",
    a: "Mark the invoice as paid and every future reminder is cancelled immediately — enforced on the server, not just in the interface.",
  },
  {
    q: "Can I customize emails?",
    a: "Yes. Edit subject and body for every reminder step, with merge fields like client name, amount, and due date. Keep it polite — PaidChase is built for professional follow-ups.",
  },
  {
    q: "Is my invoice data private?",
    a: "Your data is isolated per account with row-level security, and uploaded invoice files live in private storage reachable only by you.",
  },
];

export default function Noop() {
  return null;
}

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <span className="text-base font-semibold tracking-tight">
            Paid<span className="text-primary">Chase</span>
          </span>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth" search={{ mode: "login" as const }}>
                Sign in
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" as const }}>
                Start free
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-5 py-20 text-center">
        <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
          Send an invoice. Forget it.
          <br />
          We chase until you&apos;re paid.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          PaidChase automatically sends polite payment reminders so freelancers and small
          businesses don&apos;t have to keep chasing clients.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link to="/auth" search={{ mode: "signup" as const }}>
              Start Free <ArrowRight className="size-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how-it-works">See How It Works</a>
          </Button>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto max-w-3xl px-5 py-14 text-center">
          <h2 className="text-lg font-medium">
            Still checking your spreadsheet to remember who owes you money?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm text-muted-foreground">
            Chasing payment is awkward, easy to forget, and it always lands at the bottom of the
            list. PaidChase does it on schedule, in your name, in a tone you&apos;d actually use.
          </p>
        </div>
      </section>

      <section id="how-it-works" className="mx-auto max-w-5xl px-5 py-16">
        <h2 className="text-xl font-semibold">How it works</h2>
        <ol className="mt-6 grid gap-4 md:grid-cols-4">
          {[
            ["1", "Add an invoice", "Create one here or upload the PDF you already have."],
            ["2", "Choose a sequence", "Friendly, Standard or Persistent follow-ups."],
            ["3", "PaidChase follows up", "Reminders go out automatically on schedule."],
            ["4", "Mark it paid", "Every future reminder stops instantly."],
          ].map(([step, title, body]) => (
            <li key={step} className="rounded-lg border border-border p-4">
              <span className="text-xs font-medium text-primary">Step {step}</span>
              <p className="mt-2 text-sm font-medium">{title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-16">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-xl font-semibold">Why PaidChase</h2>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {[
                "No accounting software",
                "No complicated CRM",
                "No manual reminders",
                "No spreadsheets",
                "Just payment follow-ups",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <Check className="size-4 text-success" /> {item}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg border border-border p-5">
            <p className="text-sm font-medium">Example timeline</p>
            <ul className="mt-4 space-y-3 text-sm">
              {[
                ["Invoice sent", "Aug 10", true],
                ["Reminder — due tomorrow", "Aug 13", true],
                ["Reminder — due today", "Aug 14", true],
                ["Follow-up — 3 days late", "Aug 17", false],
                ["Final reminder", "Aug 21", false],
              ].map(([label, date, done]) => (
                <li key={label as string} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2">
                    <span
                      className={
                        done
                          ? "size-1.5 rounded-full bg-success"
                          : "size-1.5 rounded-full bg-muted-foreground/40"
                      }
                    />
                    {label}
                  </span>
                  <span className="text-muted-foreground">{date}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-surface">
        <div className="mx-auto grid max-w-3xl gap-4 px-5 py-16 md:grid-cols-2">
          <div className="rounded-lg border border-border bg-background p-5">
            <p className="text-sm font-medium">Free</p>
            <p className="mt-2 text-2xl font-semibold">$0</p>
            <p className="mt-1 text-sm text-muted-foreground">5 active invoices</p>
          </div>
          <div className="rounded-lg border border-primary/40 bg-background p-5">
            <p className="text-sm font-medium">Solo</p>
            <p className="mt-2 text-2xl font-semibold">
              $7<span className="text-sm font-normal text-muted-foreground">/month</span>
            </p>
            <p className="mt-1 text-sm text-muted-foreground">Unlimited invoices and reminders</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-5 py-16">
        <h2 className="text-xl font-semibold">Questions</h2>
        <Accordion type="single" collapsible className="mt-4">
          {FAQ.map((item) => (
            <AccordionItem key={item.q} value={item.q}>
              <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
              <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-2 px-5 py-6 text-sm text-muted-foreground">
          <span>PaidChase — payment follow-ups, nothing else.</span>
          <Link to="/auth" search={{ mode: "signup" as const }} className="hover:text-foreground">
            Start free
          </Link>
        </div>
      </footer>
    </div>
  );
}
