ALTER TABLE public.sessions ADD COLUMN hearing_type text;
ALTER TABLE public.sessions ADD COLUMN notes text;
COMMENT ON COLUMN public.sessions.hearing_type IS 'Optional hearing type label, e.g. Arraignment, Trial, or a custom value';
COMMENT ON COLUMN public.sessions.notes IS 'Optional free-form session notes shown with the recording list';