-- 1. Catalogo canonico de departamentos
CREATE TABLE public.departments (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  aliases text[] NOT NULL DEFAULT '{}',
  active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read departments"
ON public.departments FOR SELECT TO authenticated USING (true);

-- Seed com os departamentos reais encontrados nos dados (monthly_metrics + engagement)
INSERT INTO public.departments (name, aliases, active) VALUES
  ('COMMERCIAL', ARRAY['Commercial'], true),
  ('CW GROUP', '{}', true),
  ('DIRETORIA', '{}', true),
  ('FINANCE', ARRAY['Finance'], true),
  ('HR', ARRAY['Human Resources'], true),
  ('LEGAL & COMPLIANCE', ARRAY['Legal'], true),
  ('MARKETING', ARRAY['Marketing'], true),
  ('OPERATION', ARRAY['Customer Service', 'OPERATIONS'], true),
  ('PORTO', '{}', true),
  ('PRODUCT', ARRAY['Product'], true),
  ('SEM DEPTO', '{}', false),
  ('TECHNOLOGY', ARRAY['Technology', 'TECH'], true),
  ('TECHNOLOGY GROUP', '{}', true)
ON CONFLICT (name) DO NOTHING;

-- 2. Cargo, level e responsabilidades por usuario
ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS job_level text,
  ADD COLUMN IF NOT EXISTS responsibilities text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at timestamp with time zone NOT NULL DEFAULT now();

-- 3. Validacao das regras de acesso no banco (backstop das server functions)
CREATE OR REPLACE FUNCTION public.validate_allowed_email_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.email := lower(trim(NEW.email));

  IF NEW.job_title IS NOT NULL THEN
    NEW.job_title := nullif(trim(NEW.job_title), '');
    IF char_length(coalesce(NEW.job_title, '')) > 80 THEN
      RAISE EXCEPTION 'Cargo deve ter no maximo 80 caracteres';
    END IF;
  END IF;

  IF NEW.job_level IS NOT NULL THEN
    NEW.job_level := nullif(trim(NEW.job_level), '');
    IF char_length(coalesce(NEW.job_level, '')) > 40 THEN
      RAISE EXCEPTION 'Level deve ter no maximo 40 caracteres';
    END IF;
  END IF;

  IF coalesce(array_length(NEW.responsibilities, 1), 0) > 20 THEN
    RAISE EXCEPTION 'Maximo de 20 responsabilidades por usuario';
  END IF;

  IF NEW.profile IN ('hrbp', 'dept_leader') THEN
    IF coalesce(array_length(NEW.departments, 1), 0) = 0
       AND coalesce(array_length(NEW.job_families, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Perfis HRBP e Department Leader exigem ao menos um departamento ou job family';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.departments) AS d
      WHERE NOT EXISTS (
        SELECT 1 FROM public.departments dep WHERE dep.name = d AND dep.active
      )
    ) THEN
      RAISE EXCEPTION 'Todo departamento atribuido precisa existir e estar ativo no catalogo';
    END IF;
  ELSE
    NEW.departments := '{}';
    NEW.job_families := '{}';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_allowed_email_rules
BEFORE INSERT OR UPDATE ON public.allowed_emails
FOR EACH ROW EXECUTE FUNCTION public.validate_allowed_email_rules();