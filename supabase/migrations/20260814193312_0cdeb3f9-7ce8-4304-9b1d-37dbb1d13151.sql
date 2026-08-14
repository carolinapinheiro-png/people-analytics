ALTER TABLE public.allowed_emails
  ADD COLUMN IF NOT EXISTS extra_tabs text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS can_see_individual boolean,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_login_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_allowed_email_rules()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tabs text[] := ARRAY['overview','team','dei','comp','demographics','engagement','span','attrition','recruitment','individual','data'];
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

  -- Aba concedida precisa ser uma aba que existe. Um valor digitado errado
  -- nao pode virar permissao silenciosa (nem, no futuro, um curinga).
  NEW.extra_tabs := coalesce(NEW.extra_tabs, '{}');
  IF EXISTS (SELECT 1 FROM unnest(NEW.extra_tabs) AS t WHERE NOT (t = ANY (v_tabs))) THEN
    RAISE EXCEPTION 'Aba concedida invalida';
  END IF;

  -- Validade no passado seria um cadastro que nasce morto: quase sempre e erro
  -- de digitacao, e o efeito (pessoa sem acesso) e dificil de diagnosticar.
  IF TG_OP = 'INSERT' AND NEW.expires_at IS NOT NULL AND NEW.expires_at <= now() THEN
    RAISE EXCEPTION 'A validade do acesso precisa ser no futuro';
  END IF;

  IF NEW.profile IN ('hrbp', 'dept_leader', 'engagement_viewer') THEN
    IF coalesce(array_length(NEW.departments, 1), 0) = 0
       AND coalesce(array_length(NEW.job_families, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Perfis HRBP, Department Leader e Experiencia exigem ao menos um departamento ou job family';
    END IF;
    IF EXISTS (
      SELECT 1 FROM unnest(NEW.departments) AS d
      WHERE NOT EXISTS (SELECT 1 FROM public.departments dep WHERE dep.name = d AND dep.active)
    ) THEN
      RAISE EXCEPTION 'Todo departamento atribuido precisa existir e estar ativo no catalogo';
    END IF;
  ELSE
    NEW.departments := '{}';
    NEW.job_families := '{}';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $function$;