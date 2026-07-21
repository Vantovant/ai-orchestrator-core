
CREATE OR REPLACE FUNCTION public.hub_merge_contacts(
  primary_id uuid,
  duplicate_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p public.hub_contacts%ROWTYPE;
  d public.hub_contacts%ROWTYPE;
  dup_id uuid;
  merged_links int := 0;
  removed_links int := 0;
  merged_dups int := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  IF primary_id IS NULL OR duplicate_ids IS NULL OR array_length(duplicate_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'primary_id and duplicate_ids required';
  END IF;

  IF primary_id = ANY(duplicate_ids) THEN
    RAISE EXCEPTION 'primary_id cannot be in duplicate_ids';
  END IF;

  SELECT * INTO p FROM public.hub_contacts WHERE id = primary_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'primary not found'; END IF;

  -- Step 1: soft-delete duplicates FIRST so unique partial indexes on
  -- (lower(email)) and (phone_e164) WHERE is_deleted=false free up for
  -- the primary to absorb those values.
  FOREACH dup_id IN ARRAY duplicate_ids LOOP
    SELECT * INTO d FROM public.hub_contacts WHERE id = dup_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    UPDATE public.hub_contacts
       SET is_deleted = true,
           updated_at = now(),
           version = version + 1
     WHERE id = dup_id;

    -- Fill NULL fields on primary from duplicate
    UPDATE public.hub_contacts
       SET email                    = COALESCE(p.email,                    d.email),
           phone_e164               = COALESCE(p.phone_e164,               d.phone_e164),
           first_name               = COALESCE(NULLIF(p.first_name,''),    d.first_name),
           last_name                = COALESCE(NULLIF(p.last_name,''),     d.last_name),
           whatsapp_display_name    = COALESCE(NULLIF(p.whatsapp_display_name,''), d.whatsapp_display_name),
           contact_source           = COALESCE(NULLIF(p.contact_source,'unknown'), d.contact_source, p.contact_source),
           contact_confidence       = COALESCE(NULLIF(p.contact_confidence,'unknown'), d.contact_confidence, p.contact_confidence),
           lead_type                = COALESCE(p.lead_type,                d.lead_type),
           temperature              = COALESCE(p.temperature,              d.temperature),
           stage_id                 = COALESCE(p.stage_id,                 d.stage_id),
           assigned_to              = COALESCE(p.assigned_to,              d.assigned_to),
           notes                    = CASE
                                        WHEN p.notes IS NULL OR p.notes = '' THEN d.notes
                                        WHEN d.notes IS NULL OR d.notes = '' OR d.notes = p.notes THEN p.notes
                                        ELSE p.notes || E'\n---\n' || d.notes
                                      END,
           tags                     = ARRAY(SELECT DISTINCT unnest(COALESCE(p.tags,'{}') || COALESCE(d.tags,'{}'))),
           unsubscribed_channels    = ARRAY(SELECT DISTINCT unnest(COALESCE(p.unsubscribed_channels,'{}') || COALESCE(d.unsubscribed_channels,'{}'))),
           consent_whatsapp         = p.consent_whatsapp OR d.consent_whatsapp,
           consent_email            = p.consent_email    OR d.consent_email,
           consent_sms              = p.consent_sms      OR d.consent_sms,
           name_needs_confirmation  = p.name_needs_confirmation OR d.name_needs_confirmation
     WHERE id = primary_id;

    -- Refresh p snapshot for next iteration
    SELECT * INTO p FROM public.hub_contacts WHERE id = primary_id;

    -- Reassign links: skip app_keys the primary already has (keep primary's remote_id)
    FOR merged_links IN
      SELECT 0
    LOOP END LOOP;

    WITH moved AS (
      UPDATE public.hub_contact_links l
         SET hub_contact_id = primary_id
       WHERE l.hub_contact_id = dup_id
         AND NOT EXISTS (
           SELECT 1 FROM public.hub_contact_links x
            WHERE x.hub_contact_id = primary_id AND x.app_key = l.app_key
         )
       RETURNING 1
    )
    SELECT merged_links + COUNT(*) INTO merged_links FROM moved;

    WITH dropped AS (
      DELETE FROM public.hub_contact_links
       WHERE hub_contact_id = dup_id
       RETURNING 1
    )
    SELECT removed_links + COUNT(*) INTO removed_links FROM dropped;

    merged_dups := merged_dups + 1;
  END LOOP;

  -- Final version bump on primary so spokes pick up merged state
  UPDATE public.hub_contacts
     SET version = version + 1,
         updated_at = now()
   WHERE id = primary_id;

  RETURN jsonb_build_object(
    'ok', true,
    'primary_id', primary_id,
    'merged_duplicates', merged_dups,
    'moved_links', merged_links,
    'removed_links', removed_links
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hub_merge_contacts(uuid, uuid[]) TO authenticated;
