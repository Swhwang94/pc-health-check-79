ALTER TABLE public.diagnoses
  ADD CONSTRAINT diagnoses_session_id_key UNIQUE (session_id);
