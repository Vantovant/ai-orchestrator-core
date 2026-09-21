-- Wellness & Health module: weight/vitals tracking, doctor's reports, wellness journal
-- Replaces "Onboarding Emails" in the admin nav (retired, see AppLayout.tsx)

-- ── wellness_metrics — weight & vitals over time ──────────────────────────
CREATE TABLE public.wellness_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  recorded_on DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg NUMERIC(5,2),
  waist_cm NUMERIC(5,1),
  systolic_bp INTEGER,
  diastolic_bp INTEGER,
  resting_hr INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_metrics"
  ON public.wellness_metrics
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_metrics_user_date
  ON public.wellness_metrics (user_id, recorded_on DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_metrics_updated_at
  BEFORE UPDATE ON public.wellness_metrics
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── wellness_documents — doctor's reports, lab results, scans, etc. ───────
CREATE TABLE public.wellness_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other'
    CHECK (category IN ('lab_results', 'consultation', 'imaging', 'prescription', 'other')),
  doctor_name TEXT,
  facility TEXT,
  report_date DATE,
  notes TEXT,
  file_path TEXT,
  file_name TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_documents"
  ON public.wellness_documents
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_documents_user_date
  ON public.wellness_documents (user_id, report_date DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_documents_updated_at
  BEFORE UPDATE ON public.wellness_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── wellness_journal — free-form wellness / weight-loss journal ───────────
CREATE TABLE public.wellness_journal (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  mood TEXT,
  energy_level INTEGER CHECK (energy_level BETWEEN 1 AND 5),
  goal_focus TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.wellness_journal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wellness_journal"
  ON public.wellness_journal
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_wellness_journal_user_date
  ON public.wellness_journal (user_id, entry_date DESC)
  WHERE deleted_at IS NULL;

CREATE TRIGGER update_wellness_journal_updated_at
  BEFORE UPDATE ON public.wellness_journal
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ── Storage: private bucket for doctor's report files ─────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('wellness-documents', 'wellness-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users upload own wellness files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'wellness-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users read own wellness files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'wellness-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users delete own wellness files"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'wellness-documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
