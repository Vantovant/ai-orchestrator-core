-- Wellness & Health v2: exercise log, health profile (conditions/allergies/meds),
-- goals, and richer body/mind tracking on existing tables.

-- ── Extend wellness_metrics — fuller daily vitals ────────────────────
ALTER TABLE public.wellness_metrics
  ADD COLUMN IF NOT EXISTS body_fat_pct NUMERIC(4,1),
  ADD COLUMN IF NOT EXISTS steps INTEGER,
  ADD COLUMN IF NOT EXISTS sleep_hours NUMERIC(3,1),
  ADD COLUMN IF NOT EXISTS water_ml INTEGER;

-- ── Extend wellness_journal — the "mind" side ───────────────────────
ALTER TABLE public.wellness_journal
  ADD COLUMN IF NOT EXISTS stress_level INTEGER CHECK (stress_level BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS sleep_quality INTEGER CHECK (sleep_quality BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS meditation_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS gratitude TEXT;

-- ── Extend wellness_documents — follow-up tracking ──────────────────
ALTER TABLE public.wellness_documents
  ADD COLUMN IF NOT EXISTS follow_up_date DATE;

-- ── wellness_workouts — exercise log ───────────────────────────────
CREATE TABLE public.wellness_workouts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  workout_date DATE NOT NULL DEFAULT CURRENT_DATE,
  activity TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('cardio', 'strength', 'flexibility', 'sports', 'mind_body', 'other')),
  duration_minutes INTEGER,
  intensity TEXT CHECK (intensity IN ('low', 'moderate', 'high')),
  distance_km NUMERIC(5,2),
  calories_burned INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_workouts"
  ON public.wellness_workouts
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_workouts_user_date
  ON public.wellness_workouts (user_id, workout_date DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_workouts_updated_at
  BEFORE UPDATE ON public.wellness_workouts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── wellness_conditions — health profile: ongoing conditions, allergies, meds ─
CREATE TABLE public.wellness_conditions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL
    CHECK (item_type IN ('condition', 'allergy', 'medication', 'immunization')),
  name TEXT NOT NULL,
  detail TEXT,                -- dosage/frequency for meds, severity for allergies, etc.
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'ongoing', 'resolved')),
  started_on DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_conditions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_conditions"
  ON public.wellness_conditions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_conditions_user_type
  ON public.wellness_conditions (user_id, item_type)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_conditions_updated_at
  BEFORE UPDATE ON public.wellness_conditions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── wellness_goals — body / mind / health self-development targets ────────
CREATE TABLE public.wellness_goals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  domain TEXT NOT NULL DEFAULT 'body'
    CHECK (domain IN ('body', 'mind', 'health')),
  target_metric TEXT,          -- e.g. "weight_kg", "workouts_per_week", "meditation_minutes"
  target_value NUMERIC,
  starting_value NUMERIC,
  target_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'achieved', 'abandoned')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_goals"
  ON public.wellness_goals
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_goals_user_status
  ON public.wellness_goals (user_id, status)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_goals_updated_at
  BEFORE UPDATE ON public.wellness_goals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
