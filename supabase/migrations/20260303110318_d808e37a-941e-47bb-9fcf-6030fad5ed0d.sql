
-- Trigger function: auto-create a reminder 1 hour before each meeting
CREATE OR REPLACE FUNCTION public.auto_create_meeting_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete any previous auto-reminder for this meeting (on update)
  DELETE FROM public.reminders
    WHERE task_id IS NULL
      AND user_id = NEW.user_id
      AND description = 'auto-meeting-' || NEW.id;

  -- Only create if meeting is not deleted and start_time is in the future
  IF NEW.deleted_at IS NULL AND NEW.start_time > now() THEN
    INSERT INTO public.reminders (user_id, title, description, reminder_time)
    VALUES (
      NEW.user_id,
      '📅 Meeting in 1 hour: ' || NEW.title,
      'auto-meeting-' || NEW.id,
      NEW.start_time - interval '1 hour'
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Fire on insert or update of meetings
CREATE TRIGGER trg_meeting_auto_reminder
AFTER INSERT OR UPDATE ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_meeting_reminder();

-- Also clean up reminder when a meeting is soft-deleted
CREATE OR REPLACE FUNCTION public.auto_delete_meeting_reminder()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    DELETE FROM public.reminders
      WHERE user_id = NEW.user_id
        AND description = 'auto-meeting-' || NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_delete_reminder
AFTER UPDATE OF deleted_at ON public.meetings
FOR EACH ROW
EXECUTE FUNCTION public.auto_delete_meeting_reminder();

-- Backfill: create reminders for all existing future meetings
INSERT INTO public.reminders (user_id, title, description, reminder_time)
SELECT
  m.user_id,
  '📅 Meeting in 1 hour: ' || m.title,
  'auto-meeting-' || m.id,
  m.start_time - interval '1 hour'
FROM public.meetings m
WHERE m.deleted_at IS NULL
  AND m.start_time > now()
ON CONFLICT DO NOTHING;
