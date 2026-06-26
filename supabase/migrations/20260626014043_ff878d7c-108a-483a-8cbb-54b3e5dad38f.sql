-- 1. Foreign keys on session_audit_log (audit rows must not outlive their parents).
--    Existing orphans (if any) are deleted first so the FK can be added.
DELETE FROM public.session_audit_log a
 WHERE NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = a.session_id);

ALTER TABLE public.session_audit_log
  ADD CONSTRAINT session_audit_log_session_id_fkey
  FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;

ALTER TABLE public.session_audit_log
  ADD CONSTRAINT session_audit_log_case_id_fkey
  FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- 2. Indexes that back hot RLS quals and the case detail list.
CREATE INDEX IF NOT EXISTS sessions_case_id_idx ON public.sessions (case_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON public.sessions (user_id);
CREATE INDEX IF NOT EXISTS cases_user_id_idx    ON public.cases    (user_id);

-- Rollback (manual, if needed):
-- DROP INDEX IF EXISTS public.sessions_case_id_idx;
-- DROP INDEX IF EXISTS public.sessions_user_id_idx;
-- DROP INDEX IF EXISTS public.cases_user_id_idx;
-- ALTER TABLE public.session_audit_log DROP CONSTRAINT IF EXISTS session_audit_log_session_id_fkey;
-- ALTER TABLE public.session_audit_log DROP CONSTRAINT IF EXISTS session_audit_log_case_id_fkey;
