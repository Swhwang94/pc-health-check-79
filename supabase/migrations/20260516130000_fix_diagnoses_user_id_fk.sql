-- diagnoses.user_id FK가 public.users(id)를 참조하고 있어
-- auth.users(id)와 달라 로그인 유저 insert 시 409 FK 위반 발생.
-- public.users 대신 auth.users를 직접 참조하도록 재설정.
ALTER TABLE public.diagnoses
  DROP CONSTRAINT IF EXISTS diagnoses_user_id_fkey;

ALTER TABLE public.diagnoses
  ADD CONSTRAINT diagnoses_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
