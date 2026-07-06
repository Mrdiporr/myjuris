DROP POLICY IF EXISTS "read own exports" ON public.export_audit_log;
CREATE POLICY "case owner reads exports" ON public.export_audit_log
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.cases c WHERE c.id = export_audit_log.case_id AND c.user_id = auth.uid()));