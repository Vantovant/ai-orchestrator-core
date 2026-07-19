ALTER TABLE public.vos_approval_requests
  DROP CONSTRAINT IF EXISTS vos_appr_two_key_distinct;

ALTER TABLE public.vos_approval_requests
  ADD CONSTRAINT vos_appr_two_key_distinct
  CHECK (
    second_reviewed_by IS NULL
    OR second_reviewed_by <> reviewed_by
    OR (
      approval_status = 'second_reviewed'
      AND reviewed_by IS NOT NULL
      AND second_reviewed_by = reviewed_by
      AND approver_jwt_subject = reviewed_by::text
      AND second_approver_jwt_subject = reviewed_by::text
      AND coalesce(approver_role_at_time, '') = 'admin'
      AND coalesce(second_approver_role_at_time, '') = 'admin'
    )
  );