-- Etapa 1: tabelas de referencia (sem dado pessoal)
--
-- Duas tabelas que nao contem nenhuma informacao de individuo:
--   company_bu_map  -> de-para entre a "Empresa" das bases de origem e a
--                      unidade de negocio usada no dashboard
--   salary_bands    -> tabela de bandas salariais por familia/contrato/nivel
--
-- Servem de trilho: validam o caminho banco -> app -> importacao sem
-- expor nada sensivel.

-- ---------------------------------------------------------------------------
-- 1. De-para de empresa para unidade de negocio
-- ---------------------------------------------------------------------------
-- Regra por prefixo NAO funciona aqui: "NSX BETFAIR BRASIL S.A." comeca com
-- NSX mas pertence a Betfair. O mapeamento precisa ser explicito.

CREATE TYPE public.business_unit AS ENUM ('nsx_br', 'betfair', 'flutter_intl');

CREATE TABLE public.company_bu_map (
  company_name  text PRIMARY KEY,
  business_unit public.business_unit NOT NULL,
  source_system text NOT NULL,
  notes         text,
  created_at    timestamp with time zone DEFAULT now()
);

COMMENT ON TABLE public.company_bu_map IS
  'De-para entre o campo Empresa das bases de origem e a unidade de negocio do dashboard.';

INSERT INTO public.company_bu_map (company_name, business_unit, source_system, notes) VALUES
  ('NSX BRASIL RECIFE',       'nsx_br',       'talent_mobility', NULL),
  ('NSX BRASIL SÃO PAULO',    'nsx_br',       'talent_mobility', NULL),
  ('NSX MARECHAL',            'nsx_br',       'talent_mobility', NULL),
  ('NSX BETFAIR BRASIL S.A.', 'betfair',      'talent_mobility', 'Comeca com NSX mas e Betfair'),
  ('FLUTTER INTERNATIONAL',   'flutter_intl', 'talent_mobility', NULL);

-- O Workday (Brazil FBe) entra como fonte adicional de Betfair. Nao ha chave
-- comum com o Talent Mobility: um identifica por CPF, o outro por Employee ID.
-- A sobreposicao medida em jul/2026 foi de 18 pessoas entre as duas fontes.
INSERT INTO public.company_bu_map (company_name, business_unit, source_system, notes) VALUES
  ('__WORKDAY_BRAZIL_FBE__', 'betfair', 'workday', 'Fonte adicional de Betfair; sem chave comum com talent_mobility');

-- ---------------------------------------------------------------------------
-- 2. Bandas salariais
-- ---------------------------------------------------------------------------
-- Os quartis do arquivo de origem sao derivados de minimo/medio/maximo:
--   Q1 = (min + mid) / 2   Q2 = mid   Q3 = (mid + max) / 2   Q4 = max
-- Conferido nas 100 linhas: zero divergencias. Por isso sao colunas geradas,
-- e nao dados armazenados -- guardar os dois convida a divergirem.

CREATE TABLE public.salary_bands (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_family  text NOT NULL,
  contract    text NOT NULL CHECK (contract IN ('CLT', 'PJ')),
  level       text NOT NULL,
  minimum     numeric(12,2) NOT NULL,
  midpoint    numeric(12,2) NOT NULL,
  maximum     numeric(12,2) NOT NULL,
  q1          numeric(12,2) GENERATED ALWAYS AS ((minimum + midpoint) / 2) STORED,
  q2          numeric(12,2) GENERATED ALWAYS AS (midpoint) STORED,
  q3          numeric(12,2) GENERATED ALWAYS AS ((midpoint + maximum) / 2) STORED,
  q4          numeric(12,2) GENERATED ALWAYS AS (maximum) STORED,
  effective_from date NOT NULL DEFAULT '2026-01-01',
  created_at  timestamp with time zone DEFAULT now(),
  CONSTRAINT salary_bands_ordered CHECK (minimum <= midpoint AND midpoint <= maximum),
  CONSTRAINT salary_bands_unique UNIQUE (job_family, contract, level, effective_from)
);

COMMENT ON TABLE public.salary_bands IS
  'Bandas salariais por familia, tipo de contrato e nivel. Origem: COMP_RATIO_v2.';

INSERT INTO public.salary_bands (job_family, contract, level, minimum, midpoint, maximum) VALUES
  ('TECH','CLT','L9',80925.00,124500.00,168075.00),
  ('TECH','CLT','L8',58565.00,90100.00,121635.00),
  ('TECH','CLT','L7',45570.00,65100.00,84630.00),
  ('TECH','CLT','L6',35325.00,47100.00,58875.00),
  ('TECH','CLT','L5',25280.00,31600.00,37920.00),
  ('TECH','CLT','L4',18080.00,22600.00,27120.00),
  ('TECH','CLT','L3',12880.00,16100.00,19320.00),
  ('TECH','CLT','L2',9200.00,11500.00,13800.00),
  ('TECH','CLT','L1',6400.00,8000.00,9600.00),
  ('TECH','CLT','L0',4640.00,5800.00,6960.00),
  ('TECH','PJ','L9',91667.55,141027.00,190386.45),
  ('TECH','PJ','L8',66829.10,102814.00,138798.90),
  ('TECH','PJ','L7',52103.10,74433.00,96762.90),
  ('TECH','PJ','L6',40873.50,54498.00,68122.50),
  ('TECH','PJ','L5',29728.00,37160.00,44592.00),
  ('TECH','PJ','L4',21394.40,26743.00,32091.60),
  ('TECH','PJ','L3',15465.60,19332.00,23198.40),
  ('TECH','PJ','L2',11394.40,14243.00,17091.60),
  ('TECH','PJ','L1',8124.00,10155.00,12186.00),
  ('TECH','PJ','L0',6168.80,7711.00,9253.20),
  ('CORPORATE','CLT','L9',63244.39,97298.27,131353.18),
  ('CORPORATE','CLT','L8',43577.11,67041.70,90506.30),
  ('CORPORATE','CLT','L7',32329.80,46185.43,60041.06),
  ('CORPORATE','CLT','L6',23862.30,31816.40,39770.50),
  ('CORPORATE','CLT','L5',16767.66,20959.57,25151.48),
  ('CORPORATE','CLT','L4',11321.68,14152.10,16982.52),
  ('CORPORATE','CLT','L3',7933.44,9916.80,11900.16),
  ('CORPORATE','CLT','L2',5586.46,6983.08,8379.70),
  ('CORPORATE','CLT','L1',3817.97,4772.46,5726.95),
  ('CORPORATE','CLT','L0',2356.00,2945.00,3534.00),
  ('CORPORATE','PJ','L9',69782.62,107357.00,144932.52),
  ('CORPORATE','PJ','L8',48633.65,74821.00,101008.35),
  ('CORPORATE','PJ','L7',36248.10,51783.00,67317.90),
  ('CORPORATE','PJ','L6',27294.00,36392.00,45490.00),
  ('CORPORATE','PJ','L5',19677.60,24597.00,29516.40),
  ('CORPORATE','PJ','L4',13484.80,16856.00,20227.20),
  ('CORPORATE','PJ','L3',9689.60,12112.00,14534.40),
  ('CORPORATE','PJ','L2',7181.60,8977.00,10772.40),
  ('CORPORATE','PJ','L1',5120.00,6400.00,7680.00),
  ('CORPORATE','PJ','L0',3547.20,4434.00,5320.80),
  ('MARKETING/COM','CLT','L9',76290.00,117370.00,158450.00),
  ('MARKETING/COM','CLT','L8',55280.00,85050.00,114820.00),
  ('MARKETING/COM','CLT','L7',42520.00,60750.00,78980.00),
  ('MARKETING/COM','CLT','L6',31860.00,42480.00,53100.00),
  ('MARKETING/COM','CLT','L5',21840.00,27300.00,32760.00),
  ('MARKETING/COM','CLT','L4',14100.00,17630.00,21160.00),
  ('MARKETING/COM','CLT','L3',9470.00,11840.00,14210.00),
  ('MARKETING/COM','CLT','L2',6580.00,8220.00,9860.00),
  ('MARKETING/COM','CLT','L1',4240.00,5300.00,6360.00),
  ('MARKETING/COM','CLT','L0',2570.00,3210.00,3850.00),
  ('MARKETING/COM','PJ','L9',86518.98,133107.00,179695.02),
  ('MARKETING/COM','PJ','L8',63179.74,97204.00,131228.26),
  ('MARKETING/COM','PJ','L7',48714.97,69601.00,90487.03),
  ('MARKETING/COM','PJ','L6',37024.50,49366.00,61707.50),
  ('MARKETING/COM','PJ','L5',25907.20,32384.00,38860.80),
  ('MARKETING/COM','PJ','L4',16972.79,21222.00,25471.21),
  ('MARKETING/COM','PJ','L3',11677.53,14600.00,17522.47),
  ('MARKETING/COM','PJ','L2',8484.36,10599.00,12713.64),
  ('MARKETING/COM','PJ','L1',5724.00,7155.00,8586.00),
  ('MARKETING/COM','PJ','L0',3870.21,4834.00,5797.79),
  ('CUSTOMER SERVICE','CLT','L9',49023.00,75420.00,101817.00),
  ('CUSTOMER SERVICE','CLT','L8',33352.00,51310.00,69268.00),
  ('CUSTOMER SERVICE','CLT','L7',24430.00,34900.00,45370.00),
  ('CUSTOMER SERVICE','CLT','L6',17805.00,23740.00,29675.00),
  ('CUSTOMER SERVICE','CLT','L5',11816.00,14770.00,17724.00),
  ('CUSTOMER SERVICE','CLT','L4',7896.00,9870.00,11844.00),
  ('CUSTOMER SERVICE','CLT','L3',5720.00,7150.00,8580.00),
  ('CUSTOMER SERVICE','CLT','L2',4032.00,5040.00,6048.00),
  ('CUSTOMER SERVICE','CLT','L1',2704.00,3380.00,4056.00),
  ('CUSTOMER SERVICE','CLT','L0',2574.40,3218.00,3861.60),
  ('CUSTOMER SERVICE','PJ','L9',56229.55,86507.00,116784.45),
  ('CUSTOMER SERVICE','PJ','L8',38821.83,59725.00,80628.17),
  ('CUSTOMER SERVICE','PJ','L7',28620.20,40886.00,53151.80),
  ('CUSTOMER SERVICE','PJ','L6',21411.75,28549.00,35686.25),
  ('CUSTOMER SERVICE','PJ','L5',14772.00,18465.00,22158.00),
  ('CUSTOMER SERVICE','PJ','L4',10081.60,12602.00,15122.40),
  ('CUSTOMER SERVICE','PJ','L3',7512.00,9390.00,11268.00),
  ('CUSTOMER SERVICE','PJ','L2',5653.60,7067.00,8480.40),
  ('CUSTOMER SERVICE','PJ','L1',4018.40,5023.00,6027.60),
  ('CUSTOMER SERVICE','PJ','L0',3129.60,3912.00,4694.40),
  ('COMMERCIAL','CLT','L9',67372.00,103650.00,139928.00),
  ('COMMERCIAL','CLT','L8',46956.00,72240.00,97524.00),
  ('COMMERCIAL','CLT','L7',35238.00,50340.00,65442.00),
  ('COMMERCIAL','CLT','L6',27495.00,36660.00,45825.00),
  ('COMMERCIAL','CLT','L5',20728.00,25910.00,31092.00),
  ('COMMERCIAL','CLT','L4',14200.00,17750.00,21300.00),
  ('COMMERCIAL','CLT','L3',9472.00,11840.00,14208.00),
  ('COMMERCIAL','CLT','L2',6256.00,7820.00,9384.00),
  ('COMMERCIAL','CLT','L1',4176.00,5220.00,6264.00),
  ('COMMERCIAL','CLT','L0',2824.00,3530.00,4236.00),
  ('COMMERCIAL','PJ','L9',69781.53,107357.00,144932.47),
  ('COMMERCIAL','PJ','L8',53933.75,82975.00,112016.25),
  ('COMMERCIAL','PJ','L7',40625.90,58037.00,75448.10),
  ('COMMERCIAL','PJ','L6',32175.75,42901.00,53626.25),
  ('COMMERCIAL','PJ','L5',24672.00,30840.00,37008.00),
  ('COMMERCIAL','PJ','L4',17084.00,21355.00,25626.00),
  ('COMMERCIAL','PJ','L3',11680.00,14600.00,17520.00),
  ('COMMERCIAL','PJ','L2',8124.00,10155.00,12186.00),
  ('COMMERCIAL','PJ','L1',5653.60,7067.00,8480.40),
  ('COMMERCIAL','PJ','L0',4151.20,5189.00,6226.80);

-- ---------------------------------------------------------------------------
-- 3. Permissoes
-- ---------------------------------------------------------------------------
-- Leitura para qualquer usuario autenticado (o gate de autorizacao ja e feito
-- por allowed_emails). Escrita apenas pelo service_role: sao tabelas de
-- referencia, nao devem ser alteradas pelo app.

ALTER TABLE public.company_bu_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_bands   ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.company_bu_map TO authenticated;
GRANT SELECT ON public.salary_bands   TO authenticated;
GRANT ALL    ON public.company_bu_map TO service_role;
GRANT ALL    ON public.salary_bands   TO service_role;

CREATE POLICY "Authenticated can read company_bu_map"
  ON public.company_bu_map FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can read salary_bands"
  ON public.salary_bands FOR SELECT TO authenticated USING (true);
