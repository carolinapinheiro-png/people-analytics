-- Recrutamento (InHire) -- agregados por mes e foto das vagas em aberto.
--
-- ORIGEM E POR QUE E AGREGADO
-- Os dados vem da camada analitica do InHire (ClickHouse, view JobsWithStatusTSV2).
-- Guardamos SO agregados: nenhuma linha de candidato sai do InHire. Nome, e-mail e
-- curriculo nao sao necessarios para nada que o dashboard mostra.
--
-- O TTH E CALCULADO POR NOS -- E ISSO E UMA DECISAO, NAO UM ATALHO
-- A view do InHire tem uma coluna `sla` documentada como "ja calculado, excluindo
-- congelamento". Na pratica ela esta VAZIA nas 156 vagas. Entao reconstruimos o
-- tempo a partir do `statusHistory` (que esta completo), somando apenas os trechos
-- em que a vaga esteve com status `open` e descartando `paused`/`canceled` --
-- exatamente a regra da aba Diretrizes: dias corridos, descontada a inatividade.
-- Validado em dois casos conhecidos (ex.: Senior Data Scientist, 227 dias corridos,
-- 6 congelados, 221 ativos) e resistente a eventos duplicados de fechamento.
--
-- FILTROS OBRIGATORIOS (achados na validacao, nao sao opcionais)
--  * Talent pool: UMA vaga ("Talent Pool - Agente de Suporte") concentra 299 das 346
--    posicoes da base, e a flag `isTalentPool` esta FALSE nela. Filtrar so pela flag
--    nao resolve -- e preciso flag + departamento + nome.
--  * Vagas com 0 dias de SLA: 5 registros, 1 candidatura cada. Nao sao processos
--    reais (teste/duplicata); ficam fora das medias de tempo.
--
-- DE-PARA DE DEPARTAMENTO
-- O InHire nao preenche a coluna `area` (0 de 156); o departamento vive no campo
-- personalizado `Departamento` (154 de 156), com nomes proprios: "Tecnologia",
-- "RH", "Operation" E "Operations" convivendo, e "Betfair" cadastrado como
-- departamento quando e marca. O de-para para o nosso canonico e aplicado na
-- extracao. BETFAIR fica separado de proposito -- somar em um departamento nosso
-- seria inventar.
--
-- LIMITE DE PERIODO
-- Fechamentos so existem a partir de nov/2025 no ATS. A serie de gente comeca em
-- jan/2025, entao o cruzamento entre as duas so e honesto de nov/2025 em diante.

CREATE TABLE IF NOT EXISTS public.recruitment_monthly (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month        date NOT NULL,
  department   text NOT NULL,
  closed_jobs  integer NOT NULL DEFAULT 0,
  tth_avg      numeric,
  tth_median   integer,
  applications integer NOT NULL DEFAULT 0,
  loaded_at    timestamptz DEFAULT now(),
  CONSTRAINT recruitment_monthly_unique UNIQUE (month, department)
);

CREATE TABLE IF NOT EXISTS public.recruitment_open_snapshot (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  as_of        date NOT NULL,
  department   text NOT NULL,
  status       text NOT NULL,      -- 'Aberta' | 'Congelada'
  jobs         integer NOT NULL DEFAULT 0,
  positions    integer NOT NULL DEFAULT 0,
  applications integer NOT NULL DEFAULT 0,
  avg_age_days integer,
  loaded_at    timestamptz DEFAULT now(),
  CONSTRAINT recruitment_open_unique UNIQUE (as_of, department, status)
);

ALTER TABLE public.recruitment_monthly ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recruitment_open_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.recruitment_monthly TO authenticated;
GRANT SELECT ON public.recruitment_open_snapshot TO authenticated;
GRANT ALL ON public.recruitment_monthly TO service_role;
GRANT ALL ON public.recruitment_open_snapshot TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='recruitment_monthly' AND policyname='auth read recruitment monthly') THEN
    CREATE POLICY "auth read recruitment monthly" ON public.recruitment_monthly
      FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='recruitment_open_snapshot' AND policyname='auth read recruitment open') THEN
    CREATE POLICY "auth read recruitment open" ON public.recruitment_open_snapshot
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.recruitment_monthly IS
  'Recrutamento por mes/departamento (InHire). TTH = dias corridos com status open, descontado congelamento; calculado por nos porque a coluna sla do InHire vem vazia.';
COMMENT ON TABLE public.recruitment_open_snapshot IS
  'Foto das vagas abertas/congeladas por departamento (InHire). Nao e serie: e o retrato da data em as_of.';
