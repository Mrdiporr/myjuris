
CREATE TABLE public.export_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  actor_user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('transcript_docx','audio')),
  filename text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX export_audit_log_session_idx ON public.export_audit_log(session_id, occurred_at DESC);

GRANT SELECT, INSERT ON public.export_audit_log TO authenticated;
GRANT ALL ON public.export_audit_log TO service_role;

ALTER TABLE public.export_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own exports" ON public.export_audit_log
  FOR SELECT TO authenticated
  USING (actor_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.cases c WHERE c.id = export_audit_log.case_id AND c.user_id = auth.uid()
  ));

CREATE POLICY "insert own exports" ON public.export_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid() AND EXISTS (
    SELECT 1 FROM public.sessions s WHERE s.id = export_audit_log.session_id AND s.user_id = auth.uid() AND s.case_id = export_audit_log.case_id
  ));
