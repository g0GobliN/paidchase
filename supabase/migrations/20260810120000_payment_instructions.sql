-- Payment instructions: give the recipient a way to actually pay.
--
-- The seeded reminder copy already says "using the details on the invoice", but no
-- payment details existed anywhere in the schema and the invoice PDF was never
-- attached to any email, so the reminder was a dead end.
--
-- The merge tag is added to the system templates here rather than appended at send
-- time on purpose: a runtime append would silently rewrite user-authored bodies,
-- duplicate the block for anyone who does reference the tag, and desync the
-- invoice_reminders snapshot from what is actually sent. In a migration, the block is
-- visible in the template editor — users can move it, reword it, or delete it.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS payment_instructions TEXT;

-- Append the tag to the 12 system steps, after the sign-off, where payment details
-- conventionally sit. Plain concatenation rather than a positional regex: this cannot
-- silently fail to match, and the result is editable in the UI anyway.
--
-- Only sequences owned by nobody (user_id IS NULL) are touched. Forked personal
-- sequences keep exactly the prose their owner wrote.
UPDATE public.reminder_steps AS s
SET body = s.body || E'\n\n{{payment_instructions}}'
FROM public.reminder_sequences AS seq
WHERE s.sequence_id = seq.id
  AND seq.user_id IS NULL
  AND s.body NOT LIKE '%{{payment_instructions}}%';

-- Keep not-yet-sent reminders in sync with the new copy, matching the pattern used by
-- 20260810015500_enrich_reminder_email_copy.sql.
UPDATE public.invoice_reminders AS r
SET email_subject = s.subject,
    email_body = s.body
FROM public.reminder_steps AS s
WHERE r.step_id = s.id
  AND r.status IN ('scheduled', 'failed');
