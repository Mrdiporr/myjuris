
DROP POLICY IF EXISTS "own sessions insert" ON public.sessions;
CREATE POLICY "own sessions insert" ON public.sessions
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND user_id = auth.uid())
  );

DROP POLICY IF EXISTS "own sessions update" ON public.sessions;
CREATE POLICY "own sessions update" ON public.sessions
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.cases WHERE id = case_id AND user_id = auth.uid())
  );
