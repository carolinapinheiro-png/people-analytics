alter table public.monthly_metrics
  add column if not exists family_base jsonb not null default '{}'::jsonb,
  add column if not exists contract_base jsonb not null default '{}'::jsonb;

comment on column public.monthly_metrics.family_base is
  'Contagem de pessoas por Job Type Family no mês.';
comment on column public.monthly_metrics.contract_base is
  'Contagem de pessoas por vínculo no mês (CLT, Pessoa Jurídica, Aprendiz).';

notify pgrst, 'reload schema';