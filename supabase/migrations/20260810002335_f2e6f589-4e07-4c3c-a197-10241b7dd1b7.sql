
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TYPE public.invoice_status AS ENUM ('draft','scheduled','sent','paid','paused','cancelled');
CREATE TYPE public.reminder_status AS ENUM ('scheduled','processing','sent','failed','cancelled');
CREATE TYPE public.sequence_type AS ENUM ('friendly','standard','persistent','custom');

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  business_name TEXT,
  sender_name TEXT,
  email TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  default_sequence_id UUID,
  onboarding_completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, sender_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'sender_name', ''))
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own clients" ON public.clients FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX clients_user_idx ON public.clients(user_id);

CREATE TABLE public.reminder_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  name TEXT NOT NULL,
  type public.sequence_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_sequences TO authenticated;
GRANT ALL ON public.reminder_sequences TO service_role;
ALTER TABLE public.reminder_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read sequences" ON public.reminder_sequences FOR SELECT TO authenticated USING (user_id IS NULL OR user_id = auth.uid());
CREATE POLICY "manage own sequences" ON public.reminder_sequences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.reminder_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sequence_id UUID NOT NULL REFERENCES public.reminder_sequences(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  offset_days INT NOT NULL,
  offset_type TEXT NOT NULL DEFAULT 'after_due',
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminder_steps TO authenticated;
GRANT ALL ON public.reminder_steps TO service_role;
ALTER TABLE public.reminder_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read steps" ON public.reminder_steps FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.reminder_sequences s WHERE s.id = sequence_id AND (s.user_id IS NULL OR s.user_id = auth.uid()))
);
CREATE POLICY "manage own steps" ON public.reminder_steps FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.reminder_sequences s WHERE s.id = sequence_id AND s.user_id = auth.uid())
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.reminder_sequences s WHERE s.id = sequence_id AND s.user_id = auth.uid())
);

CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  sequence_id UUID REFERENCES public.reminder_sequences(id),
  invoice_number TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  description TEXT,
  issue_date DATE NOT NULL DEFAULT current_date,
  due_date DATE NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'draft',
  pdf_path TEXT,
  paid_at TIMESTAMPTZ,
  paused_at TIMESTAMPTZ,
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, invoice_number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own invoices" ON public.invoices FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX invoices_user_idx ON public.invoices(user_id);

CREATE TABLE public.invoice_reminders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  step_id UUID REFERENCES public.reminder_steps(id) ON DELETE SET NULL,
  sequence_step INT NOT NULL DEFAULT 1,
  scheduled_at TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status public.reminder_status NOT NULL DEFAULT 'scheduled',
  email_subject TEXT,
  email_body TEXT,
  provider_message_id TEXT,
  error_message TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_reminders TO authenticated;
GRANT ALL ON public.invoice_reminders TO service_role;
ALTER TABLE public.invoice_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own reminders" ON public.invoice_reminders FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER invoice_reminders_updated_at BEFORE UPDATE ON public.invoice_reminders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX reminders_due_idx ON public.invoice_reminders(status, scheduled_at);
CREATE UNIQUE INDEX reminders_unique_step ON public.invoice_reminders(invoice_id, sequence_step);

CREATE TABLE public.invoice_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoice_events TO authenticated;
GRANT ALL ON public.invoice_events TO service_role;
ALTER TABLE public.invoice_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own events" ON public.invoice_events FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX events_invoice_idx ON public.invoice_events(invoice_id);

CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own subscription" ON public.subscriptions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.reminder_sequences (id, user_id, name, type, description) VALUES
 ('11111111-1111-4111-8111-111111111111', NULL, 'Friendly', 'friendly', 'Due date, +3 days, +7 days'),
 ('22222222-2222-4222-8222-222222222222', NULL, 'Standard', 'standard', '1 day before, due date, +3 days, +7 days'),
 ('33333333-3333-4333-8333-333333333333', NULL, 'Persistent', 'persistent', '3 days before, due date, +2, +5, +10 days');

INSERT INTO public.reminder_steps (sequence_id, step_order, offset_days, offset_type, subject, body) VALUES
 ('11111111-1111-4111-8111-111111111111', 1, 0, 'on_due', 'Invoice {{invoice_number}} is due today', E'Hi {{client_name}},\n\nJust a friendly note that invoice {{invoice_number}} for {{amount}} is due today ({{due_date}}).\n\nThanks so much!\n{{sender_name}}\n{{business_name}}'),
 ('11111111-1111-4111-8111-111111111111', 2, 3, 'after_due', 'Quick nudge on invoice {{invoice_number}}', E'Hi {{client_name}},\n\nJust checking in on invoice {{invoice_number}} for {{amount}}, which was due on {{due_date}}. If it is already on its way, please ignore this note.\n\nThanks,\n{{sender_name}}\n{{business_name}}'),
 ('11111111-1111-4111-8111-111111111111', 3, 7, 'after_due', 'Invoice {{invoice_number}} still outstanding', E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is now 7 days past its due date of {{due_date}}. Could you let me know when I can expect payment?\n\nThank you,\n{{sender_name}}\n{{business_name}}'),
 ('22222222-2222-4222-8222-222222222222', 1, -1, 'before_due', 'Invoice {{invoice_number}} is due tomorrow', E'Hi {{client_name}},\n\nA quick reminder that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nThanks!\n{{sender_name}}\n{{business_name}}'),
 ('22222222-2222-4222-8222-222222222222', 2, 0, 'on_due', 'Invoice {{invoice_number}} is due today', E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due today. Let me know if you need anything from my side.\n\nThanks,\n{{sender_name}}\n{{business_name}}'),
 ('22222222-2222-4222-8222-222222222222', 3, 3, 'after_due', 'Following up on invoice {{invoice_number}}', E'Hi {{client_name}},\n\nFollowing up on invoice {{invoice_number}} for {{amount}}, which was due on {{due_date}} and is still showing as unpaid.\n\nCould you confirm the payment status?\n\nThanks,\n{{sender_name}}\n{{business_name}}'),
 ('22222222-2222-4222-8222-222222222222', 4, 7, 'after_due', 'Invoice {{invoice_number}} — 7 days overdue', E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is now 7 days overdue. I would appreciate an update on when it will be paid.\n\nThank you,\n{{sender_name}}\n{{business_name}}'),
 ('33333333-3333-4333-8333-333333333333', 1, -3, 'before_due', 'Upcoming: invoice {{invoice_number}} due {{due_date}}', E'Hi {{client_name}},\n\nA heads-up that invoice {{invoice_number}} for {{amount}} is due on {{due_date}}.\n\nThanks!\n{{sender_name}}\n{{business_name}}'),
 ('33333333-3333-4333-8333-333333333333', 2, 0, 'on_due', 'Invoice {{invoice_number}} is due today', E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} is due today ({{due_date}}).\n\nThanks,\n{{sender_name}}\n{{business_name}}'),
 ('33333333-3333-4333-8333-333333333333', 3, 2, 'after_due', 'Invoice {{invoice_number}} is past due', E'Hi {{client_name}},\n\nInvoice {{invoice_number}} for {{amount}} was due on {{due_date}} and is now past due. Could you let me know the status?\n\nThanks,\n{{sender_name}}\n{{business_name}}'),
 ('33333333-3333-4333-8333-333333333333', 4, 5, 'after_due', 'Second reminder: invoice {{invoice_number}}', E'Hi {{client_name}},\n\nThis is a second reminder that invoice {{invoice_number}} for {{amount}} remains unpaid since {{due_date}}. Please let me know when payment will be sent.\n\nThank you,\n{{sender_name}}\n{{business_name}}'),
 ('33333333-3333-4333-8333-333333333333', 5, 10, 'after_due', 'Final reminder: invoice {{invoice_number}}', E'Hi {{client_name}},\n\nThis is my final reminder regarding invoice {{invoice_number}} for {{amount}}, now 10 days overdue since {{due_date}}. Please arrange payment or reply with an update so we can resolve this.\n\nThank you,\n{{sender_name}}\n{{business_name}}');

CREATE POLICY "own invoice files read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own invoice files write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own invoice files update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "own invoice files delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'invoice-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
