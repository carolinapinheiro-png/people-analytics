-- ===========================================================================
-- Mediana de tempo e idade média deixam de ser integer
-- ===========================================================================
--
-- Encontrado na primeira gravação real da sincronização com o InHire:
--
--   Falha ao gravar a série mensal: invalid input syntax for type integer: "44.5"
--
-- `tth_median` era `integer`. A mediana de um número PAR de vagas é a média dos
-- dois valores centrais, e cai em .5 com frequência -- 44,5 dias é o valor
-- CORRETO, não um defeito de cálculo. O tipo é que estava errado.
--
-- O mesmo vale para `avg_age_days`, que é uma média por definição.
--
-- Por que corrigir o tipo em vez de arredondar na origem: arredondar resolveria
-- o sintoma e jogaria fora o dado certo, além de deixar as três métricas de
-- tempo inconsistentes entre si -- `tth_avg` já era numeric e mantinha a casa
-- decimal. Pior: a próxima métrica de tempo que alguém acrescentasse cairia na
-- mesma armadilha, e o erro só apareceria na hora de gravar, com a carga
-- inteira abortada.
--
-- Nada de parcial ficou no banco quando isso aconteceu: a série mensal é
-- gravada antes da foto de vagas abertas, então a falha interrompeu tudo antes
-- da primeira escrita.
-- ===========================================================================

alter table public.recruitment_monthly
  alter column tth_median type numeric(6,1);

alter table public.recruitment_open_snapshot
  alter column avg_age_days type numeric(6,1);

comment on column public.recruitment_monthly.tth_median is
  'Mediana de dias ate o fechamento. numeric, nao integer: com numero par de vagas a mediana cai em .5.';
