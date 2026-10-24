-- GPS Trip Logger. Additive only: trips / trip_expenses / finance_entries are referenced, never altered.
CREATE TABLE public.location_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  display_name text NOT NULL,
  source text NOT NULL DEFAULT 'owntracks' CHECK (source IN ('owntracks','tasker','manual_import')),
  token_hash text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  last_seen_at timestamptz,
  rate_window_start timestamptz,
  rate_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX location_devices_user_idx ON public.location_devices(user_id);
GRANT SELECT, INSERT, DELETE ON public.location_devices TO authenticated;
GRANT UPDATE (display_name, enabled, revoked_at) ON public.location_devices TO authenticated;
GRANT ALL ON public.location_devices TO service_role;
ALTER TABLE public.location_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices select" ON public.location_devices FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own devices insert" ON public.location_devices FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices update" ON public.location_devices FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own devices delete" ON public.location_devices FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.trip_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  device_id uuid NOT NULL REFERENCES public.location_devices(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
  actual_started_at timestamptz NOT NULL DEFAULT now(),
  actual_ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_tracking_sessions_user_idx ON public.trip_tracking_sessions(user_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_tracking_sessions TO authenticated;
GRANT ALL ON public.trip_tracking_sessions TO service_role;
ALTER TABLE public.trip_tracking_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions" ON public.trip_tracking_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trip_location_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_id uuid NOT NULL REFERENCES public.location_devices(id) ON DELETE CASCADE,
  trip_id uuid REFERENCES public.trips(id),
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_m double precision CHECK (accuracy_m IS NULL OR accuracy_m >= 0),
  speed_kmh double precision CHECK (speed_kmh IS NULL OR speed_kmh >= 0),
  heading_deg double precision,
  altitude_m double precision,
  source text NOT NULL DEFAULT 'owntracks',
  source_event_id text,
  dedupe_fingerprint text NOT NULL,
  payload_version text,
  quality_status text NOT NULL DEFAULT 'accepted' CHECK (quality_status IN ('accepted','low_accuracy','suspect')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX trip_location_points_event_uq ON public.trip_location_points(device_id, source_event_id) WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX trip_location_points_fp_uq ON public.trip_location_points(device_id, dedupe_fingerprint);
CREATE INDEX trip_location_points_user_time_idx ON public.trip_location_points(user_id, recorded_at);
CREATE INDEX trip_location_points_trip_time_idx ON public.trip_location_points(trip_id, recorded_at);
CREATE INDEX trip_location_points_device_time_idx ON public.trip_location_points(device_id, recorded_at);
GRANT SELECT, DELETE ON public.trip_location_points TO authenticated;
GRANT UPDATE (trip_id) ON public.trip_location_points TO authenticated;
GRANT ALL ON public.trip_location_points TO service_role;
ALTER TABLE public.trip_location_points ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own points select" ON public.trip_location_points FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own points update" ON public.trip_location_points FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own points delete" ON public.trip_location_points FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  seq integer NOT NULL DEFAULT 0,
  arrival_at timestamptz NOT NULL,
  arrival_uncertainty_seconds integer NOT NULL DEFAULT 0,
  departure_at timestamptz,
  departure_uncertainty_seconds integer NOT NULL DEFAULT 0,
  dwell_seconds integer,
  centroid_lat double precision NOT NULL CHECK (centroid_lat BETWEEN -90 AND 90),
  centroid_lon double precision NOT NULL CHECK (centroid_lon BETWEEN -180 AND 180),
  radius_m double precision,
  mean_accuracy_m double precision,
  point_count integer NOT NULL DEFAULT 0,
  place_name text,
  place_provider text,
  place_provider_id text,
  confidence double precision NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  detection_version text NOT NULL,
  label_override text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_stops_trip_idx ON public.trip_stops(trip_id, arrival_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_stops TO authenticated;
GRANT ALL ON public.trip_stops TO service_role;
ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own stops" ON public.trip_stops FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trip_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id uuid NOT NULL REFERENCES public.trips(id),
  seq integer NOT NULL DEFAULT 0,
  from_stop_id uuid REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  to_stop_id uuid REFERENCES public.trip_stops(id) ON DELETE SET NULL,
  started_at timestamptz,
  ended_at timestamptz,
  actual_seconds integer,
  observed_distance_km double precision,
  travel_mode text NOT NULL DEFAULT 'ground' CHECK (travel_mode IN ('ground','flight','unknown')),
  missing_intervals jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_seconds integer,
  expected_distance_km double precision,
  delay_seconds integer,
  routing_provider text,
  routing_requested_at timestamptz,
  comparison_basis text NOT NULL DEFAULT 'none' CHECK (comparison_basis IN ('historical_traffic','current_traffic','static_route','none')),
  coverage_ratio double precision CHECK (coverage_ratio IS NULL OR coverage_ratio BETWEEN 0 AND 1),
  confidence double precision NOT NULL DEFAULT 0 CHECK (confidence BETWEEN 0 AND 1),
  detection_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX trip_legs_trip_idx ON public.trip_legs(trip_id, seq);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_legs TO authenticated;
GRANT ALL ON public.trip_legs TO service_role;
ALTER TABLE public.trip_legs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own legs" ON public.trip_legs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.trip_expense_stop_links (
  trip_expense_id uuid NOT NULL REFERENCES public.trip_expenses(id),
  trip_stop_id uuid NOT NULL REFERENCES public.trip_stops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_expense_id, trip_stop_id)
);
GRANT SELECT, INSERT, DELETE ON public.trip_expense_stop_links TO authenticated;
GRANT ALL ON public.trip_expense_stop_links TO service_role;
ALTER TABLE public.trip_expense_stop_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own links" ON public.trip_expense_stop_links FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.location_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  trip_id uuid REFERENCES public.trips(id),
  algorithm_version text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','ok','error')),
  error_summary text,
  point_count integer NOT NULL DEFAULT 0
);
CREATE INDEX location_processing_runs_trip_idx ON public.location_processing_runs(trip_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.location_processing_runs TO authenticated;
GRANT ALL ON public.location_processing_runs TO service_role;
ALTER TABLE public.location_processing_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own runs" ON public.location_processing_runs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE public.location_settings (
  user_id uuid PRIMARY KEY,
  raw_point_retention_days integer NOT NULL DEFAULT 90 CHECK (raw_point_retention_days BETWEEN 1 AND 3650),
  auto_delete_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.location_settings IS 'Retention proposal: raw points 90 days, stops/legs until deleted. auto_delete_enabled is not acted on yet.';
GRANT SELECT, INSERT, UPDATE ON public.location_settings TO authenticated;
GRANT ALL ON public.location_settings TO service_role;
ALTER TABLE public.location_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own location settings" ON public.location_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Cross-row ownership guard: any trip / device / expense / stop reference must belong to the same user.
CREATE OR REPLACE FUNCTION public.location_ownership_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE j jsonb := to_jsonb(NEW);
BEGIN
  IF j ? 'trip_id' AND (j->>'trip_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM trips WHERE id = (j->>'trip_id')::uuid AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Trip not found for this user.';
  END IF;
  IF j ? 'device_id' AND (j->>'device_id') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM location_devices WHERE id = (j->>'device_id')::uuid AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Device not found for this user.';
  END IF;
  IF j ? 'trip_expense_id' AND NOT EXISTS (
    SELECT 1 FROM trip_expenses WHERE id = (j->>'trip_expense_id')::uuid AND user_id = NEW.user_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Trip expense not found for this user.';
  END IF;
  IF j ? 'trip_stop_id' AND NOT EXISTS (
    SELECT 1 FROM trip_stops WHERE id = (j->>'trip_stop_id')::uuid AND user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Stop not found for this user.';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_location_points_owner BEFORE INSERT OR UPDATE ON public.trip_location_points FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
CREATE TRIGGER trg_tracking_sessions_owner BEFORE INSERT OR UPDATE ON public.trip_tracking_sessions FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
CREATE TRIGGER trg_trip_stops_owner BEFORE INSERT OR UPDATE ON public.trip_stops FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
CREATE TRIGGER trg_trip_legs_owner BEFORE INSERT OR UPDATE ON public.trip_legs FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
CREATE TRIGGER trg_expense_stop_links_owner BEFORE INSERT OR UPDATE ON public.trip_expense_stop_links FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
CREATE TRIGGER trg_location_runs_owner BEFORE INSERT OR UPDATE ON public.location_processing_runs FOR EACH ROW EXECUTE FUNCTION public.location_ownership_guard();
