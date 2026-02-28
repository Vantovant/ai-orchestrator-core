
-- Clients/Matters table for professional workflow tagging
CREATE TABLE public.clients (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'client', -- client | matter | project
  reference_code TEXT,
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own clients" ON public.clients FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Entity links: tags tasks/meetings/finance_entries to clients
CREATE TABLE public.entity_client_links (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- task | meeting | finance_entry
  entity_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE(client_id, entity_type, entity_id)
);

ALTER TABLE public.entity_client_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own entity_client_links" ON public.entity_client_links FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Compliance reminders table
CREATE TABLE public.compliance_reminders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  type TEXT NOT NULL, -- sars_provisional | vat_return | uif | paye | annual_return | custom
  label TEXT NOT NULL,
  due_date DATE NOT NULL,
  is_done BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.compliance_reminders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own compliance_reminders" ON public.compliance_reminders FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
