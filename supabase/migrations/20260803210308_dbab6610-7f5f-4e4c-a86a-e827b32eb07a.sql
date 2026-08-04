CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_allowed_emails_search_trgm
  ON public.allowed_emails
  USING gin (lower(email) gin_trgm_ops, lower(coalesce(job_title, '')) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_allowed_emails_created_at
  ON public.allowed_emails (created_at DESC);