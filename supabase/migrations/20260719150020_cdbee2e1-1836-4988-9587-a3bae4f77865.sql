
-- Strategy Engine (Phase B) ------------------------------------------------

CREATE TABLE public.vos_strategy_directives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  goal_text text NOT NULL,
  kpi_target jsonb NOT NULL DEFAULT '{}'::jsonb,
  horizon_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'draft',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT vos_strategy_directives_status_chk CHECK (status IN ('draft','broadcast','closed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vos_strategy_directives TO authenticated;
GRANT ALL ON public.vos_strategy_directives TO service_role;
ALTER TABLE public.vos_strategy_directives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage directives" ON public.vos_strategy_directives
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.vos_strategy_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id uuid NOT NULL REFERENCES public.vos_strategy_directives(id) ON DELETE CASCADE,
  app_key text NOT NULL,
  delivery_status text NOT NULL DEFAULT 'pending',
  nonce text,
  delivered_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vos_strategy_targets_status_chk CHECK (delivery_status IN ('pending','delivered','failed'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vos_strategy_targets TO authenticated;
GRANT ALL ON public.vos_strategy_targets TO service_role;
ALTER TABLE public.vos_strategy_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read targets" ON public.vos_strategy_targets
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write targets" ON public.vos_strategy_targets
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_vos_strategy_targets_directive ON public.vos_strategy_targets(directive_id);

CREATE TABLE public.vos_strategy_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  directive_id uuid REFERENCES public.vos_strategy_directives(id) ON DELETE SET NULL,
  app_key text NOT NULL,
  kind text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text,
  nonce text,
  verified boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vos_strategy_snapshots_kind_chk CHECK (kind IN ('snapshot','proposal','status'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vos_strategy_snapshots TO authenticated;
GRANT ALL ON public.vos_strategy_snapshots TO service_role;
ALTER TABLE public.vos_strategy_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read snapshots" ON public.vos_strategy_snapshots
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins write snapshots" ON public.vos_strategy_snapshots
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_vos_strategy_snapshots_directive ON public.vos_strategy_snapshots(directive_id);
CREATE INDEX idx_vos_strategy_snapshots_app ON public.vos_strategy_snapshots(app_key);

CREATE TABLE public.vos_strategy_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.vos_strategy_snapshots(id) ON DELETE SET NULL,
  directive_id uuid REFERENCES public.vos_strategy_directives(id) ON DELETE SET NULL,
  app_key text NOT NULL,
  summary text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  review_state text NOT NULL DEFAULT 'pending',
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vos_strategy_proposals_state_chk CHECK (review_state IN ('pending','approved','rejected'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vos_strategy_proposals TO authenticated;
GRANT ALL ON public.vos_strategy_proposals TO service_role;
ALTER TABLE public.vos_strategy_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage proposals" ON public.vos_strategy_proposals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_vos_strategy_proposals_directive ON public.vos_strategy_proposals(directive_id);

-- updated_at trigger for directives
CREATE OR REPLACE FUNCTION public.vos_strategy_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vos_strategy_directives_touch
BEFORE UPDATE ON public.vos_strategy_directives
FOR EACH ROW EXECUTE FUNCTION public.vos_strategy_touch_updated_at();

-- Promote proposal-kind snapshots into review queue
CREATE OR REPLACE FUNCTION public.vos_strategy_promote_proposal()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'proposal' THEN
    INSERT INTO public.vos_strategy_proposals(
      snapshot_id, directive_id, app_key, summary, detail
    ) VALUES (
      NEW.id,
      NEW.directive_id,
      NEW.app_key,
      COALESCE(NEW.payload->>'summary', 'Untitled proposal'),
      COALESCE(NEW.payload->'detail', NEW.payload)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_vos_strategy_promote_proposal
AFTER INSERT ON public.vos_strategy_snapshots
FOR EACH ROW EXECUTE FUNCTION public.vos_strategy_promote_proposal();
