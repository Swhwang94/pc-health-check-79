
CREATE TABLE public.parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  aliases TEXT[],
  category TEXT NOT NULL,
  brand TEXT,
  benchmark_score INT,
  specs JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.diagnoses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  diagnosis_type TEXT NOT NULL,
  parsed_specs JSONB,
  bottleneck_result JSONB,
  percentile_rank INT,
  rank_grade TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.diagnosis_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  diagnosis_id UUID NOT NULL REFERENCES public.diagnoses(id) ON DELETE CASCADE,
  input_type TEXT NOT NULL,
  file_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnoses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.diagnosis_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dev_all_parts" ON public.parts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_diagnoses" ON public.diagnoses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "dev_all_diagnosis_inputs" ON public.diagnosis_inputs FOR ALL USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('dxdiag-files', 'dxdiag-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "dev_dxdiag_select" ON storage.objects FOR SELECT USING (bucket_id = 'dxdiag-files');
CREATE POLICY "dev_dxdiag_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dxdiag-files');
CREATE POLICY "dev_dxdiag_update" ON storage.objects FOR UPDATE USING (bucket_id = 'dxdiag-files');
CREATE POLICY "dev_dxdiag_delete" ON storage.objects FOR DELETE USING (bucket_id = 'dxdiag-files');
