CREATE OR REPLACE FUNCTION public.vos_compute_source_chain_hash(approval_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  appr   public.vos_approval_requests%ROWTYPE;
  dry    public.vos_dry_run_actions%ROWTYPE;
  prop   public.vos_proposal_queue%ROWTYPE;
  payload text;
BEGIN
  SELECT * INTO appr FROM public.vos_approval_requests WHERE id = approval_id;
  IF appr IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO dry  FROM public.vos_dry_run_actions  WHERE id = appr.source_dry_run_id;
  SELECT * INTO prop FROM public.vos_proposal_queue   WHERE id = appr.source_proposal_id;

  payload :=
    coalesce(appr.id::text,'')        || '|' ||
    coalesce(appr.source_dry_run_id::text,'')   || '|' ||
    coalesce(appr.source_proposal_id::text,'')  || '|' ||
    coalesce(appr.app_id,'')          || '|' ||
    coalesce(appr.approval_type,'')   || '|' ||
    coalesce(appr.approval_title,'')  || '|' ||
    coalesce(appr.approval_summary,'')|| '|' ||
    coalesce(appr.dedupe_key,'')      || '|' ||
    coalesce(dry.id::text,'')         || '|' ||
    coalesce(dry.dry_run_title,'')    || '|' ||
    coalesce(dry.dry_run_summary,'')  || '|' ||
    coalesce(dry.dedupe_key,'')       || '|' ||
    coalesce(prop.id::text,'')        || '|' ||
    coalesce(prop.proposal_title,'')  || '|' ||
    coalesce(prop.proposal_summary,'')|| '|' ||
    coalesce(prop.dedupe_key,'');

  RETURN encode(extensions.digest(payload, 'sha256'), 'hex');
END;
$function$;