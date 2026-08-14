-- Perfil "Experiência — Engajamento": Talent Management e líderes de área que
-- acompanham engajamento e mais nada.
--
-- ===========================================================================
-- POR QUE O TRIGGER PRECISA SABER DESTE PERFIL
-- ===========================================================================
-- `validate_allowed_email_rules` lista os perfis escopados e, para todos os
-- OUTROS, apaga `departments` e `job_families`:
--
--     ELSE
--       NEW.departments := '{}';
--
-- Sem esta migração, cadastrar alguém como engagement_viewer com a área
-- TECHNOLOGY gravaria a linha com escopo VAZIO -- e sem erro. O aplicativo
-- então trataria a pessoa como "perfil restrito sem área atribuída", que
-- resolve para tela vazia. O sintoma seria "não estou vendo nada", e a causa
-- estaria três camadas abaixo, num ELSE.
--
-- A exigência de ter ao menos uma área também passa a valer: um perfil
-- escopado sem escopo é um cadastro pela metade, e a metade que falta é
-- justamente a que decide o que a pessoa vê.
create or replace function public.validate_allowed_email_rules()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

  -- engagement_viewer entra aqui junto com hrbp e dept_leader.
  IF NEW.profile IN ('hrbp', 'dept_leader', 'engagement_viewer') THEN
    IF coalesce(array_length(NEW.departments, 1), 0) = 0
       AND coalesce(array_length(NEW.job_families, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Perfis HRBP, Department Leader e Experiencia exigem ao menos um departamento ou job family';
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
