-- Fuller professional reminder email copy for system sequences.
-- Subjects and bodies are multi-paragraph, polite, and production-ready.

UPDATE public.reminder_steps SET
  subject = 'Friendly reminder: invoice {{invoice_number}} is due today',
  body = E'Hi {{client_name}},\n\nI hope you are doing well.\n\nThis is a friendly reminder that invoice {{invoice_number}} for {{amount}} is due today ({{due_date}}).\n\nIf payment has already been sent, thank you — you can disregard this note. Otherwise, I would appreciate it if you could process payment at your earliest convenience using the details on the invoice.\n\nPlease reply if you have any questions or need anything from my side.\n\nWarm regards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '11111111-1111-4111-8111-111111111111' AND step_order = 1;

UPDATE public.reminder_steps SET
  subject = 'Checking in on invoice {{invoice_number}}',
  body = E'Hi {{client_name}},\n\nI wanted to follow up briefly regarding invoice {{invoice_number}} for {{amount}}, which was due on {{due_date}}.\n\nI have not yet recorded payment on my side. If it is already on the way, please ignore this message and accept my thanks.\n\nIf anything is unclear on the invoice, or if you need an updated copy or different payment details, just let me know and I will sort it out right away.\n\nThank you for your help.\n\nBest regards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '11111111-1111-4111-8111-111111111111' AND step_order = 2;

UPDATE public.reminder_steps SET
  subject = 'Invoice {{invoice_number}} is still outstanding',
  body = E'Hi {{client_name}},\n\nI am writing again about invoice {{invoice_number}} for {{amount}}. It is now 7 days past the due date of {{due_date}} and still shows as unpaid in my records.\n\nCould you please confirm when I should expect payment, or let me know if there is an issue blocking it? I am happy to resent the invoice or clarify any line items if that would help.\n\nThank you for taking a moment to look into this.\n\nKind regards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '11111111-1111-4111-8111-111111111111' AND step_order = 3;

UPDATE public.reminder_steps SET
  subject = 'Upcoming: invoice {{invoice_number}} due tomorrow',
  body = E'Hi {{client_name}},\n\nI hope your week is going well.\n\nThis is a short heads-up that invoice {{invoice_number}} for {{amount}} is due tomorrow ({{due_date}}).\n\nIf it is already scheduled for payment, thank you. If you need anything from me before then — a copy of the invoice, payment instructions, or a clarification — please reply and I will get it to you quickly.\n\nThanks again for your partnership.\n\nBest,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '22222222-2222-4222-8222-222222222222' AND step_order = 1;

UPDATE public.reminder_steps SET
  subject = 'Invoice {{invoice_number}} is due today',
  body = E'Hi {{client_name}},\n\nA quick note that invoice {{invoice_number}} for {{amount}} is due today ({{due_date}}).\n\nWhen convenient, please arrange payment using the details on the invoice. If payment has already gone out, thank you — no further action is needed.\n\nIf you run into any trouble with the amount, timing, or payment method, reply to this email and we can work through it together.\n\nAppreciate your attention.\n\nRegards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '22222222-2222-4222-8222-222222222222' AND step_order = 2;

UPDATE public.reminder_steps SET
  subject = 'Following up: unpaid invoice {{invoice_number}}',
  body = E'Hi {{client_name}},\n\nI am following up on invoice {{invoice_number}} for {{amount}}, which was due on {{due_date}} and still appears unpaid.\n\nCould you please confirm the payment status when you have a moment? If payment was already submitted, a quick reply with the date or reference would help me close this out on my side.\n\nIf something needs adjusting on the invoice, tell me what would make it easier to process and I will update it promptly.\n\nThank you for your help.\n\nBest regards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '22222222-2222-4222-8222-222222222222' AND step_order = 3;

UPDATE public.reminder_steps SET
  subject = 'Invoice {{invoice_number}} is 7 days overdue',
  body = E'Hi {{client_name}},\n\nI wanted to reach out again regarding invoice {{invoice_number}} for {{amount}}. It is now 7 days overdue (original due date {{due_date}}) and I have not yet received payment.\n\nPlease arrange payment as soon as you can, or reply with an expected payment date so I can update my records. If there is a blocker — missing paperwork, a PO number, or a different billing contact — let me know and I will resolve it.\n\nI value our working relationship and would like to settle this promptly.\n\nThank you,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '22222222-2222-4222-8222-222222222222' AND step_order = 4;

UPDATE public.reminder_steps SET
  subject = 'Heads-up: invoice {{invoice_number}} due {{due_date}}',
  body = E'Hi {{client_name}},\n\nI hope you are well.\n\nThis is an early reminder that invoice {{invoice_number}} for {{amount}} is coming due on {{due_date}} (in a few days).\n\nI am sending this in advance so it is easier to schedule payment with your usual process. If you need a fresh copy of the invoice or updated payment instructions, reply here and I will send them over.\n\nThank you for staying on top of this.\n\nBest,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '33333333-3333-4333-8333-333333333333' AND step_order = 1;

UPDATE public.reminder_steps SET
  subject = 'Invoice {{invoice_number}} is due today',
  body = E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due today ({{due_date}}).\n\nPlease process payment when you can using the details on the invoice. If payment is already in progress, thank you — feel free to ignore this message.\n\nI am available if you need any supporting documents or a clarification on the work covered.\n\nKind regards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '33333333-3333-4333-8333-333333333333' AND step_order = 2;

UPDATE public.reminder_steps SET
  subject = 'Invoice {{invoice_number}} is now past due',
  body = E'Hi {{client_name}},\n\nI am writing because invoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is now past due.\n\nCould you please look into this and let me know the status? If payment has been sent, a confirmation would be appreciated. If not, I would be grateful if you could arrange payment or share a clear timeline.\n\nHappy to help with anything that might be delaying approval on your end.\n\nThank you,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '33333333-3333-4333-8333-333333333333' AND step_order = 3;

UPDATE public.reminder_steps SET
  subject = 'Second notice: invoice {{invoice_number}} unpaid',
  body = E'Hi {{client_name}},\n\nThis is a second notice regarding invoice {{invoice_number}} for {{amount}}, which remains unpaid since {{due_date}}.\n\nAt this stage I need a firm update: either confirmation that payment has been submitted, or a date by which it will be paid. If the invoice needs to be redirected to accounts payable or another contact, please share their details and I will follow up with them directly.\n\nI would like to resolve this without further delay.\n\nThank you for your prompt attention.\n\nRegards,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '33333333-3333-4333-8333-333333333333' AND step_order = 4;

UPDATE public.reminder_steps SET
  subject = 'Final reminder: invoice {{invoice_number}}',
  body = E'Hi {{client_name}},\n\nThis is my final reminder regarding invoice {{invoice_number}} for {{amount}}. The invoice is now significantly overdue (due date {{due_date}}) and payment has not been received.\n\nPlease arrange payment immediately, or reply today with a concrete plan so we can close this out. If there is a dispute or missing information, tell me what is needed and I will address it right away.\n\nI prefer to keep this professional and straightforward, and I appreciate your cooperation in settling the outstanding balance.\n\nThank you,\n{{sender_name}}\n{{business_name}}'
WHERE sequence_id = '33333333-3333-4333-8333-333333333333' AND step_order = 5;

-- Keep not-yet-sent reminders in sync with the new templates.
UPDATE public.invoice_reminders AS r
SET email_subject = s.subject,
    email_body = s.body
FROM public.reminder_steps AS s
WHERE r.step_id = s.id
  AND r.status IN ('scheduled', 'failed');
