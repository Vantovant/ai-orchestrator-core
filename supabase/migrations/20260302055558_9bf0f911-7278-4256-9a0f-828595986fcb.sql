
-- Budget Items table
CREATE TABLE public.finance_budget_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'subscription',
  name text NOT NULL,
  description text DEFAULT '',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ZAR',
  cadence text NOT NULL DEFAULT 'monthly',
  due_day_of_month integer,
  due_month_of_year integer,
  due_date_custom date,
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  end_date date,
  autopay boolean NOT NULL DEFAULT false,
  notify_days_before integer NOT NULL DEFAULT 7,
  status text NOT NULL DEFAULT 'active',
  category text,
  vendor text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone
);

ALTER TABLE public.finance_budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own finance_budget_items"
  ON public.finance_budget_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_finance_budget_items_updated_at
  BEFORE UPDATE ON public.finance_budget_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Budget Events table
CREATE TABLE public.finance_budget_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  budget_item_id uuid NOT NULL REFERENCES public.finance_budget_items(id) ON DELETE CASCADE,
  due_at date NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'upcoming',
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  UNIQUE(budget_item_id, due_at)
);

ALTER TABLE public.finance_budget_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own finance_budget_events"
  ON public.finance_budget_events FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_finance_budget_events_updated_at
  BEFORE UPDATE ON public.finance_budget_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Finance Notes table
CREATE TABLE public.finance_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  note_month text NOT NULL DEFAULT to_char(now(), 'YYYY-MM'),
  content text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_at timestamp with time zone,
  UNIQUE(user_id, note_month)
);

ALTER TABLE public.finance_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own finance_notes"
  ON public.finance_notes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_finance_notes_updated_at
  BEFORE UPDATE ON public.finance_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for finance_notes
ALTER PUBLICATION supabase_realtime ADD TABLE public.finance_notes;

-- Indexes
CREATE INDEX idx_budget_items_user ON public.finance_budget_items(user_id, deleted_at);
CREATE INDEX idx_budget_events_user ON public.finance_budget_events(user_id, due_at);
CREATE INDEX idx_budget_events_item ON public.finance_budget_events(budget_item_id, due_at);
CREATE INDEX idx_finance_notes_user ON public.finance_notes(user_id, note_month);
