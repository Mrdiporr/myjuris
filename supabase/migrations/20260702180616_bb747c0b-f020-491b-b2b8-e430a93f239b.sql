
-- 1) Unique suit_number per user (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS cases_user_suit_number_unique
  ON public.cases (user_id, lower(suit_number));

-- 2) Diarization usage counter (per user, per UTC day)
CREATE TABLE IF NOT EXISTS public.diarize_usage (
  user_id uuid NOT NULL,
  day date NOT NULL,
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

GRANT SELECT ON public.diarize_usage TO authenticated;
GRANT ALL ON public.diarize_usage TO service_role;

ALTER TABLE public.diarize_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read own diarize usage"
  ON public.diarize_usage FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());
-- No INSERT/UPDATE policies: only service_role (server functions) writes.
