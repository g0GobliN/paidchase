# PaidChase: Invoice Done

Build PaidChase — Automated Payment Follow-Up SaaS

You are building the MVP of PaidChase, a lightweight SaaS for freelancers and micro-businesses that automatically follows up with clients about unpaid invoices.

Product positioning

PaidChase is NOT an accounting app, bookkeeping app, CRM, or full invoicing suite.

Its only job is:

Send an invoice. Forget it. PaidChase handles the follow-ups until you're paid.

The core workflow is:

Invoice created/uploaded
        ↓
Client + due date configured
        ↓
Reminder sequence selected
        ↓
Invoice sent
        ↓
PaidChase waits
        ↓
Automatic reminder
        ↓
Still unpaid?
        ↓
Stronger follow-up
        ↓
Still unpaid?
        ↓
Final follow-up
        ↓
Invoice marked paid
        ↓
ALL FUTURE REMINDERS STOP


The product must feel extremely simple, fast, and trustworthy.

Do NOT turn it into QuickBooks/FreshBooks/Zoho.

1. MVP SCOPE

Build the following functionality.

Authentication

Implement:

Email/password signup

Email/password login

Logout

Password reset

Protected application routes

User profile/settings

Use Supabase Auth.

Each user's data must be isolated from every other user's data.

Use Row Level Security (RLS).

2. Dashboard

Create a clean SaaS dashboard.

Navigation:

Dashboard

Invoices

Clients

Settings

Main dashboard should show:

Summary cards

Active invoices

Total outstanding

Overdue amount

Paid this month

Active invoices list

Columns:

Client

Invoice

Amount

Due date

Status

Next reminder

Actions

Statuses:

Draft

Scheduled

Sent

Due soon

Overdue

Paid

Paused

Cancelled

Make overdue invoices visually obvious but professional.

Do not use excessive colors, gradients, animations, or decorative UI.

3. Create Invoice

Users must be able to create a simple invoice.

Fields:

Client

Select an existing client or create a new client.

Invoice number

Automatically generate a sequential invoice number per user.

Example:

INV-0001
INV-0002
INV-0003


Allow editing before sending.

Amount

Support:

Currency

Total amount

Initially support common currencies such as:

USD

EUR

GBP

JPY

CAD

AUD

Store currency explicitly in the database.

Description

Simple text description.

Example:

Website design and development


Due date

Date picker.

Invoice PDF

Allow:

Create simple invoice PDF

Upload existing invoice PDF

For the MVP, the uploaded PDF can be stored in Supabase Storage.

4. Simple Invoice Generator

Create a clean professional invoice template.

It should contain:

Sender/business name

Sender email

Client name

Client email

Invoice number

Invoice date

Due date

Description

Amount

Currency

Payment instructions

Do NOT build:

tax accounting

expense tracking

bookkeeping

recurring accounting

bank reconciliation

payroll

inventory

tax calculations

The invoice generator exists only because some users may not already have an invoice.

Keep it intentionally basic.

5. Clients

Create a simple client management page.

Client fields:

Name

Company

Email

Optional phone

Notes

Show:

Number of invoices

Outstanding amount

Last invoice

Payment history

Users must be able to:

Create client

Edit client

Delete client

View client

Create invoice for client

Do not build a CRM.

No pipeline.

No sales stages.

No lead management.

No contact scoring.

6. Reminder Sequences

This is the CORE feature of PaidChase.

Provide three predefined sequences.

Friendly

Due date
+3 days
+7 days


Standard

1 day before due date
Due date
+3 days
+7 days


Persistent

3 days before due date
Due date
+2 days
+5 days
+10 days


Each reminder must have:

Trigger timing

Email subject

Email body

Reminder number

Users should be able to select one sequence when creating an invoice.

For MVP, do NOT build a complex visual workflow editor.

7. Email Templates

Create professional default email templates.

Pre-due reminder

Tone:

Friendly and casual.

Example intent:

Hi {{client_name}},

Just a quick reminder that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.

Thanks!
{{business_name}}


Due-date reminder

Polite and concise.

Overdue reminder

More direct but still professional.

Final reminder

Firm but not threatening.

Never use aggressive collection language.

Never imply legal action.

Never threaten penalties unless the user explicitly supplied that information.

8. Template Variables

Support these variables:

{{client_name}}
{{client_company}}
{{invoice_number}}
{{amount}}
{{currency}}
{{due_date}}
{{business_name}}
{{sender_name}}


Create a reusable template rendering function.

Do not duplicate template replacement logic across components.

9. Invoice Lifecycle

Implement a proper invoice state machine.

Possible states:

draft
scheduled
sent
paid
paused
cancelled


Derived UI states may include:

due_soon
overdue


An invoice cannot receive reminders when:

paid

paused

cancelled

When an invoice is marked as paid:

status = paid


and all future reminders must be cancelled/ignored.

This behavior must be enforced in backend logic, not only in the frontend.

10. Reminder Engine

Build the backend architecture for scheduled reminders.

Use a database-driven reminder system.

Create a reminders or equivalent table containing:

id

user_id

invoice_id

sequence_step

scheduled_at

sent_at

status

email_subject

email_body

provider_message_id

error_message

created_at

Statuses:

scheduled
processing
sent
failed
cancelled


Create backend logic that can query:

scheduled reminders
WHERE scheduled_at <= NOW()
AND status = scheduled


Before sending:

Verify invoice exists.

Verify invoice belongs to the authenticated user.

Verify invoice is not paid.

Verify invoice is not paused.

Verify reminder hasn't already been sent.

Send email.

Mark reminder as sent.

Store provider message ID.

Record failure if sending fails.

Make the process idempotent.

The same reminder must NEVER be sent twice because of a retry or duplicate worker execution.

11. Email Provider Abstraction

Create an email service abstraction.

Example architecture:

EmailService
    ↓
EmailProvider interface
    ↓
ResendProvider


Do NOT hard-code Resend calls throughout the application.

The rest of the application should call something like:

emailService.send(...)


rather than directly calling Resend.

This will allow the product to support other providers later.

For the MVP, implement Resend as the provider.

Environment variable:

RESEND_API_KEY


Also support:

EMAIL_FROM


Do not expose API keys to the frontend.

12. Scheduled Worker

Prepare the backend for a scheduled job.

The worker should process due reminders.

Architecture should allow:

Cron
  ↓
Reminder Processor
  ↓
Find due reminders
  ↓
Lock/process
  ↓
Send email
  ↓
Update reminder


If production cron infrastructure is not wired yet, still implement the reminder processor as a reusable backend function/API endpoint that can later be triggered by:

Cloudflare Workers Cron

Supabase scheduled functions

GitHub Actions

another scheduler

Do NOT fake scheduled execution in the frontend.

13. Reminder Timeline

Every invoice must have a timeline.

Example:

Invoice created
     ✓ Aug 10

Invoice sent
     ✓ Aug 10

Due date
     Aug 14

Reminder
     Scheduled — Aug 14

Follow-up
     Scheduled — Aug 17

Final reminder
     Scheduled — Aug 21


After sending:

✓ Sent Aug 14 at 09:02


If failed:

⚠ Failed to send


Allow retrying failed reminders.

14. Pause / Resume

Every active invoice must have:

Pause reminders
Resume reminders
Mark as paid
Cancel invoice


When paused:

Do not send reminders.

Existing scheduled reminders should become cancelled or ignored.

UI should clearly show paused status.

When resumed:

Recalculate future reminder schedule based on current state.

Do not send historical reminders immediately unless explicitly intended.

15. Mark as Paid

Add a prominent:

Mark as paid

button.

When clicked:

Ask for confirmation.

Set invoice status to paid.

Set paid_at timestamp.

Cancel future reminders.

Add event to timeline.

Do not integrate payment processing into invoices yet.

Payment happens outside PaidChase.

PaidChase only tracks whether the user has received payment.

16. File Storage

Use Supabase Storage for uploaded invoice PDFs.

Storage requirements:

User-scoped files

Private bucket

Signed URLs for access

No public invoice URLs

Never expose invoice files publicly.

Users should only be able to access their own files.

17. Database Schema

Use Supabase PostgreSQL.

Create appropriate tables.

At minimum:

profiles

id
user_id
business_name
sender_name
email
currency
created_at
updated_at


clients

id
user_id
name
company
email
phone
notes
created_at
updated_at


invoices

id
user_id
client_id
invoice_number
amount
currency
description
issue_date
due_date
status
pdf_path
paid_at
paused_at
created_at
updated_at


reminder_sequences

id
user_id nullable
name
type
created_at
updated_at


For MVP, predefined sequences can be seeded.

reminder_steps

id
sequence_id
step_order
offset_days
offset_type
subject
body
created_at


invoice_reminders

id
user_id
invoice_id
step_id
scheduled_at
sent_at
status
provider_message_id
error_message
created_at
updated_at


invoice_events

id
user_id
invoice_id
event_type
metadata
created_at


Use events for the invoice timeline.

18. Security

Security is important because this product handles financial information.

Implement:

Supabase RLS on all user-owned tables

User ownership checks

Private file storage

Signed URLs

Server-side API key handling

Input validation

Email validation

Amount validation

Currency validation

Date validation

Authorization checks on every mutation

Never trust:

user_id


from the client.

Always derive authenticated user identity from the server authentication context.

Prevent users from accessing:

another user's clients

another user's invoices

another user's PDF files

another user's reminders

another user's templates

19. UI/UX

Design direction:

Minimal, professional, calm, trustworthy.

Think:

Linear

Stripe Dashboard

modern indie SaaS

Avoid:

huge gradients

excessive animations

cartoon illustrations

unnecessary glassmorphism

complicated charts

excessive cards

giant hero sections inside the dashboard

Use a clean layout with generous whitespace.

Responsive design is required.

Desktop should be the primary experience, but mobile should remain usable.

20. Landing Page

Create a marketing landing page.

Hero:

Headline

Send an invoice. Forget it. We chase until you're paid.

Subheadline:

PaidChase automatically sends polite payment reminders so freelancers and small businesses don't have to keep chasing clients.

Primary CTA:

Start Free

Secondary CTA:

See How It Works

Sections:

Problem

"Still checking your spreadsheet to remember who owes you money?"

How it works

1. Add an invoice
2. Choose a reminder sequence
3. PaidChase follows up automatically
4. Mark it paid


Why PaidChase

No accounting software

No complicated CRM

No manual reminders

No spreadsheets

Just payment follow-ups

Example timeline

Show a realistic invoice reminder timeline.

Pricing

Free
5 active invoices

Solo
$7/month

Do not build complicated pricing tables.

FAQ

Include:

Does PaidChase process payments?

Can I upload an existing invoice?

Can I stop reminders?

What happens when a client pays?

Can I customize emails?

Is my invoice data private?

21. Settings

Settings page should include:

Profile

Business name
Sender name
Sender email

Email

Default sender information.

Default reminder sequence

Allow selecting default sequence.

Account

Change password
Logout
Delete account

Do NOT build advanced integrations yet.

22. Error Handling

Every important operation needs clear errors.

Examples:

Email send failure:

We couldn't send this reminder. We'll retry automatically.

Invalid invoice:

Please enter a valid amount and due date.

Missing client email:

Add a client email before scheduling reminders.

Expired file:

This invoice file is no longer available.

Never expose raw stack traces to users.

Log detailed errors server-side.

23. Empty States

Design useful empty states.

Dashboard:

No invoices yet. Add your first invoice and let PaidChase handle the follow-up.

Clients:

Add a client to start tracking invoices.

Invoice list:

You're all caught up.

Do not make empty screens feel broken.

24. Demo Data

Add development/demo seed data.

Example:

Acme Design
$1,200
Due Aug 14
Standard sequence

John Smith
$450
3 days overdue
Persistent sequence

Pixel Studio
$2,500
Paid


Make it easy to remove demo data.

Do not include fake data in production accounts automatically unless explicitly implemented as an onboarding demo.

25. Onboarding

After signup:

Step 1:

What's your business name?

Step 2:

What's your name?

Step 3:

Add your first client.

Step 4:

Add your first invoice.

Then:

PaidChase is ready. We'll handle the follow-ups from here.

Keep onboarding short.

Allow skipping optional fields.

26. Architecture Requirements

Keep the code modular.

Recommended structure:

src/
  components/
  pages/
  features/
    invoices/
    clients/
    reminders/
    dashboard/
  lib/
    auth/
    db/
    email/
    invoices/
    reminders/
    validation/
  hooks/
  types/


Backend/server code must be separated from browser-only code.

Do not put secrets into client-side code.

Create shared types where appropriate.

Use schema validation.

27. Important Engineering Requirements

Do NOT:

fake backend functionality

use localStorage as the primary database

hard-code invoice data

hard-code reminder state

simulate emails as successful sends

put API keys in frontend code

create fake cron functionality

create fake authentication

create fake payment state

use mock data as the production data layer

The application should use real Supabase data.

The email system should be structured for real Resend integration.

The reminder processor should operate on real database records.

28. Billing

Do NOT implement Stripe billing yet unless it can be done cleanly without compromising the MVP.

Prepare the database architecture for subscriptions, but keep the actual billing implementation isolated.

Potential future table:

subscriptions


with:

user_id
stripe_customer_id
stripe_subscription_id
plan
status
current_period_end
created_at
updated_at


The initial MVP can operate as a free beta.

Do not allow billing code to contaminate invoice/reminder logic.

29. Out of Scope

Absolutely do NOT build these now:

Accounting

Taxes

Expense tracking

Payroll

Bank integrations

Payment processing

Stripe Connect

CRM

Sales pipeline

Team management

Advanced analytics

AI email generation

Gmail integration

Outlook integration

Custom domains

Client portal

Webhooks

Mobile apps

Multi-language support

Complex recurring invoices

Subscription billing for customers' customers

Legal debt collection features

Automatic late fees

Collections automation

SMS

WhatsApp

Push notifications

The MVP must remain small.

30. Product Philosophy

The product should follow one rule:

Every feature must reduce the amount of time the user spends thinking about unpaid invoices.

If a proposed feature does not directly support that goal, leave it out.

PaidChase should feel like:

"I put the invoice in here and now I don't have to think about it."

Not:

"I have another business management dashboard to maintain."

31. Deliverables

Build the actual working application, not just a visual prototype.

Deliver:

Landing page

Authentication

Supabase database schema

RLS policies

Dashboard

Client management

Invoice creation

Invoice PDF generation

Existing PDF upload

Invoice detail page

Reminder sequence system

Reminder scheduling database

Reminder processor backend

Email service abstraction

Resend integration structure

Invoice timeline

Pause/resume

Mark as paid

Settings

Onboarding

Responsive UI

Proper loading/error/empty states

Environment variable documentation

Database migration files

Seed/demo data for development

32. Final Acceptance Test

The application is not considered complete until this flow works:

User signs up
      ↓
Creates client
      ↓
Creates invoice
      ↓
Selects Standard reminder sequence
      ↓
Invoice is scheduled
      ↓
Reminder records are created
      ↓
Reminder processor finds due reminder
      ↓
Email service sends email
      ↓
Reminder marked sent
      ↓
Invoice timeline updated
      ↓
Next reminder remains scheduled
      ↓
User marks invoice paid
      ↓
Invoice becomes PAID
      ↓
All future reminders stop


Also verify:

User A cannot access User B's data.

User A cannot access User B's PDF.

A reminder cannot be sent twice.

A paid invoice cannot generate another reminder.

A paused invoice cannot generate another reminder.

A failed email can be retried.

Invalid requests are rejected server-side.

Secrets never appear in frontend code.


33. What I want from you after implementation

After building the application:

Explain the complete architecture.

List every environment variable required.

List every database migration created.

Explain how the reminder processor works.

Explain how scheduled execution should be configured in production.

Explain how Resend should be configured.

Explain anything that could not be implemented fully.

Identify any mock/fake functionality that remains.

Identify security issues that still need manual review.

Provide a clear README for taking over development.

Do not hide incomplete functionality.

If something cannot be implemented yet, leave a clean interface/stub and clearly document what remains.

The final codebase should be clean enough for another developer to take over immediately.

PRIORITY ORDER

If you need to make tradeoffs, prioritize in this exact order:

1. Authentication + security

2. Invoice/client data

3. Reminder scheduling

4. Reminder processing

5. Real email integration

6. Mark-paid / pause behavior

7. Dashboard

8. Invoice PDF

9. Landing page

10. Visual polish

Do not sacrifice backend correctness for visual polish.

Final instruction

Build PaidChase as a focused micro-SaaS, not as a general business-management platform.

The entire product should revolve around one promise:

Send an invoice. Forget it. PaidChase handles the follow-ups until you're paid.

Keep the implementation simple, production-minded, modular, secure, and easy for a solo developer to continue in an IDE.

## Development

Requires Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd paidchase
cp .env.example .env
# fill Supabase URL + publishable key
npm i
npm run dev
```

App runs at http://localhost:8080
