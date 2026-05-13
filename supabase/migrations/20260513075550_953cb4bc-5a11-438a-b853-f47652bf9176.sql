
-- Cases
CREATE TABLE public.cases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  case_name TEXT NOT NULL,
  suit_number TEXT NOT NULL,
  plaintiff TEXT NOT NULL,
  defendant TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active','Adjourned','Disposed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, suit_number)
);
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own cases select" ON public.cases FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own cases insert" ON public.cases FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own cases update" ON public.cases FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own cases delete" ON public.cases FOR DELETE USING (auth.uid() = user_id);

-- Sessions
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT NOT NULL DEFAULT 'Court Session',
  audio_path TEXT,
  audio_mime TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  bookmarks JSONB NOT NULL DEFAULT '[]'::jsonb,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own sessions select" ON public.sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own sessions insert" ON public.sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own sessions update" ON public.sessions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own sessions delete" ON public.sessions FOR DELETE USING (auth.uid() = user_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER cases_touch BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER sessions_touch BEFORE UPDATE ON public.sessions FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Storage bucket for audio (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('session-audio', 'session-audio', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "audio own select" ON storage.objects FOR SELECT
  USING (bucket_id = 'session-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "audio own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'session-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "audio own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'session-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "audio own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'session-audio' AND auth.uid()::text = (storage.foldername(name))[1]);
