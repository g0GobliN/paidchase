# PaidChase — developer handoff

Stack: TanStack Start (React) + Supabase (Auth, Postgres, RLS, Storage) + Resend (email).

## Architecture

```text
Browser UI (routes/_authenticated/*)
        ↓ createServerFn + requireSupabaseAuth
Server functions (lib/api/*)
        ↓ user-scoped supabase client (RLS)
Postgres tables + invoice-pdfs bucket

Cron / scheduler
        ↓ POST /api/public/hooks/process-reminders  (apikey = publishable key)
processDueReminders()
        ↓ claim reminder (scheduled → processing)
        ↓ verify invoice not paid/paused/cancelled
        ↓ EmailService → ResendProvider
        ↓ mark sent / failed + invoice_events
```

Key modules:

| Path | Role |
|------|------|
| `src/lib/api/*.functions.ts` | Authenticated mutations/queries |
| `src/lib/invoices/service.server.ts` | Create invoice, schedule/cancel reminders, events |
| `src/lib/reminders/processor.server.ts` | Idempotent reminder worker |
| `src/lib/email/*` | Provider abstraction + Resend |
| `src/lib/templates.ts` | `{{variable}}` rendering |
| `supabase/migrations/` | Schema, RLS, seed sequences |

## Environment variables

| Variable | Required | Notes |
|----------|----------|-------|
| `VITE_SUPABASE_URL` / `SUPABASE_URL` | yes | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` / `SUPABASE_PUBLISHABLE_KEY` | yes | Browser + worker gate |
| `SUPABASE_SERVICE_ROLE_KEY` | yes for worker / delete-account | Server only — never expose |
| `RESEND_API_KEY` | yes for real email | Server only |
| `EMAIL_FROM` | yes for real email | Verified Resend from-address |

Copy `.env.example` → `.env`.

Without Resend env vars, the worker uses `UnconfiguredProvider` and marks sends as **failed** (no fake success).

## Migrations

1. `supabase/migrations/20260810002335_*.sql` — enums, tables, RLS, storage policies, Friendly/Standard/Persistent sequences + steps, auth trigger → profiles  
2. `supabase/migrations/20260810002352_*.sql` — revoke public execute on `handle_new_user`  
3. Storage bucket `invoice-pdfs` (private) — created on the PaidChase Supabase project

## Reminder processor

1. Load due rows: `status = scheduled` and `scheduled_at <= now()`
2. Atomically claim: update to `processing` only if still `scheduled`
3. Re-check invoice ownership/status (`canReceiveReminders`)
4. Render subject/body with template vars
5. `emailService.send(...)`
6. On success: `sent` + `provider_message_id` + event  
   On failure: `failed` + `error_message`

Same reminder cannot double-send under concurrent workers.

## Production cron

Point any scheduler at:

```bash
curl -X POST "$APP_URL/api/public/hooks/process-reminders" \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY"
```

Suggested cadence: every 5–15 minutes (Cloudflare Cron, GitHub Actions, Supabase scheduled fn, etc.).

## Resend setup

1. Create a Resend account and API key  
2. Verify the sending domain  
3. Set `RESEND_API_KEY` and `EMAIL_FROM="PaidChase <reminders@yourdomain.com>"`  
4. Trigger the worker once and confirm a test reminder

## Auth / local notes

- Disable **Confirm email** in Supabase Auth for local UX, or confirm users in the dashboard  
- Add `http://localhost:8080/**` to Auth redirect URLs  

## Not fully wired / remaining

- **No in-repo cron** — endpoint only; you must schedule it  
- **Stripe billing** — `subscriptions` table exists; no Checkout/portal  
- **Email customization UI** — templates are seeded; no per-user editor  
- **Payment history** — client list shows paid count / outstanding; no separate history page  
- **Delete account** needs `SUPABASE_SERVICE_ROLE_KEY`  
- FAQ claims are mostly true; live email requires Resend + cron  

## Security review checklist

- RLS enabled on all user tables  
- Server fns use `requireSupabaseAuth` (never trust client `user_id`)  
- PDF paths scoped to `{userId}/…`; signed URLs only  
- Worker gated by publishable key (rotate if leaked; prefer a dedicated secret later)  
- Service role only on server (`client.server.ts`)  

## Scripts

```sh
npm i
npm run dev      # http://localhost:8080
npm run build
```
