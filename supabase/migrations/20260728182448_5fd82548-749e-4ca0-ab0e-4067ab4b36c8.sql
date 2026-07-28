DO $$ BEGIN
  CREATE TYPE public.access_profile AS ENUM ('admin','hr_leader','hrbp','dept_leader');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS profile public.access_profile NOT NULL DEFAULT 'dept_leader',
  ADD COLUMN IF NOT EXISTS departments text[] NOT NULL DEFAULT '{}';

UPDATE public.allowed_emails SET profile = 'admin' WHERE role = 'admin';