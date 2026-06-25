
-- 1. Ownership guard trigger on sessions: ensures case_id belongs to user_id
CREATE OR REPLACE FUNCTION public.ensure_session_case_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = NEW.case_id AND user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'case_id % does not belong to user %', NEW.case_id, NEW.user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_ensure_case_ownership ON public.sessions;
CREATE TRIGGER sessions_ensure_case_ownership
  BEFORE INSERT OR UPDATE OF case_id, user_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.ensure_session_case_ownership();

-- 2. Audit log table
CREATE TABLE public.session_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL,
  case_id uuid NOT NULL,
  actor_user_id uuid,
  action text NOT NULL CHECK (action IN ('insert','update')),
  changed_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX session_audit_log_session_id_idx ON public.session_audit_log(session_id, occurred_at DESC);

GRANT SELECT ON public.session_audit_log TO authenticated;
GRANT ALL ON public.session_audit_log TO service_role;

ALTER TABLE public.session_audit_log ENABLE ROW LEVEL SECURITY;

-- User may read audit rows for sessions on cases they own, or rows they wrote
CREATE POLICY "audit read own"
  ON public.session_audit_log
  FOR SELECT
  TO authenticated
  USING (
    actor_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.cases c
      WHERE c.id = session_audit_log.case_id AND c.user_id = auth.uid()
    )
  );

-- No INSERT/UPDATE/DELETE policies: only the SECURITY DEFINER trigger writes.

-- 3. Trigger that writes audit rows
CREATE OR REPLACE FUNCTION public.log_session_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed jsonb := '[]'::jsonb;
  k text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.session_audit_log (session_id, case_id, actor_user_id, action, changed_fields)
    VALUES (NEW.id, NEW.case_id, auth.uid(), 'insert', '[]'::jsonb);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Track only column-name changes (not values) for privacy + size
    FOR k IN
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sessions'
    LOOP
      IF to_jsonb(NEW) -> k IS DISTINCT FROM to_jsonb(OLD) -> k THEN
        changed := changed || to_jsonb(k);
      END IF;
    END LOOP;
    INSERT INTO public.session_audit_log (session_id, case_id, actor_user_id, action, changed_fields)
    VALUES (NEW.id, NEW.case_id, auth.uid(), 'update', changed);
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sessions_audit_log ON public.sessions;
CREATE TRIGGER sessions_audit_log
  AFTER INSERT OR UPDATE ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.log_session_audit();
