-- Acesso de gestores por DEPARTAMENTO e/ou JOB TYPE FAMILY (decisao 30/07,
-- Carolina). Objetivo: o gestor ve o dashboard, mas so do seu time -- e "time"
-- pode ser definido por departamento e/ou por job family (uniao).
--
--  1. allowed_emails.job_families: lista de job families atribuidas a um perfil
--     (alem de departments). Escopo = uniao das duas listas.
--  2. comp_ratio.job_type_family: a job family de cada pessoa (fonte: Talent
--     Mobility, casada por nome). O leavers ja tem job_family. Serve para a trava
--     de escopo (isInScope) filtrar por familia alem do departamento.
--
-- O UPDATE que popula comp_ratio.job_type_family a partir do Talent Mobility e
-- aplicado offline (mesmo padrao das flags is_leader/is_people_manager): ~671
-- pessoas casadas por nome. Aqui so criamos as colunas.
ALTER TABLE public.allowed_emails ADD COLUMN IF NOT EXISTS job_families text[] NOT NULL DEFAULT '{}';
ALTER TABLE public.comp_ratio ADD COLUMN IF NOT EXISTS job_type_family text;
