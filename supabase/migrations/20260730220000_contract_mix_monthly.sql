-- Evolucao CLT/PJ no tempo. A Carolina apontou que o dado existe: o Vinculo por
-- pessoa esta no historico (com datas), entao da para reconstruir "da epoca".
-- Metodo: conjunto de ativos por mes vindo do Talent Mobility (admissao + data de
-- desligamento) e o vinculo VIGENTE no mes vindo do historico (reflete conversoes
-- PJ->CLT); os totais sao ancorados no headcount oficial reconstruido do NSX
-- (escala proporcional), para o empilhado bater com a linha de HC. So NSX: Betfair
-- BR e Flutter vem de outra fonte (Workday), sem serie de vinculo confiavel.
CREATE TABLE IF NOT EXISTS public.contract_mix_monthly (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  month     date NOT NULL,
  brand     text NOT NULL,
  contract  text NOT NULL,   -- 'CLT' | 'PJ' | 'Aprendiz' | 'Estatutário/Sócio'
  n         integer NOT NULL,
  position  integer DEFAULT 0,
  loaded_at timestamptz DEFAULT now(),
  CONSTRAINT contract_mix_monthly_unique UNIQUE (month, brand, contract)
);

ALTER TABLE public.contract_mix_monthly ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.contract_mix_monthly TO authenticated;
GRANT ALL ON public.contract_mix_monthly TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='contract_mix_monthly' AND policyname='auth read contract mix') THEN
    CREATE POLICY "auth read contract mix" ON public.contract_mix_monthly FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.contract_mix_monthly IS
  'Evolucao CLT/PJ mensal (NSX). Reconstruido do historico (vinculo da epoca) + Talent Mobility (ativos), ancorado no HC oficial.';

-- Seed: serie mensal reconstruida (jan/2025 a jul/2026, NSX).
DELETE FROM public.contract_mix_monthly;
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-01-01','NSX','CLT',149,0);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-01-01','NSX','PJ',110,1);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-01-01','NSX','Aprendiz',0,2);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-01-01','NSX','Estatutário/Sócio',12,3);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-02-01','NSX','CLT',164,4);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-02-01','NSX','PJ',113,5);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-02-01','NSX','Aprendiz',3,6);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-02-01','NSX','Estatutário/Sócio',13,7);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-03-01','NSX','CLT',167,8);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-03-01','NSX','PJ',120,9);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-03-01','NSX','Aprendiz',3,10);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-03-01','NSX','Estatutário/Sócio',13,11);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-04-01','NSX','CLT',169,12);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-04-01','NSX','PJ',129,13);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-04-01','NSX','Aprendiz',3,14);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-04-01','NSX','Estatutário/Sócio',14,15);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-05-01','NSX','CLT',166,16);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-05-01','NSX','PJ',142,17);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-05-01','NSX','Aprendiz',3,18);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-05-01','NSX','Estatutário/Sócio',8,19);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-06-01','NSX','CLT',165,20);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-06-01','NSX','PJ',153,21);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-06-01','NSX','Aprendiz',3,22);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-06-01','NSX','Estatutário/Sócio',8,23);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-07-01','NSX','CLT',169,24);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-07-01','NSX','PJ',164,25);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-07-01','NSX','Aprendiz',3,26);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-07-01','NSX','Estatutário/Sócio',8,27);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-08-01','NSX','CLT',175,28);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-08-01','NSX','PJ',169,29);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-08-01','NSX','Aprendiz',3,30);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-08-01','NSX','Estatutário/Sócio',8,31);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-09-01','NSX','CLT',190,32);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-09-01','NSX','PJ',176,33);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-09-01','NSX','Aprendiz',3,34);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-09-01','NSX','Estatutário/Sócio',6,35);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-10-01','NSX','CLT',196,36);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-10-01','NSX','PJ',190,37);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-10-01','NSX','Aprendiz',3,38);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-10-01','NSX','Estatutário/Sócio',6,39);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-11-01','NSX','CLT',200,40);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-11-01','NSX','PJ',201,41);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-11-01','NSX','Aprendiz',3,42);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-11-01','NSX','Estatutário/Sócio',6,43);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-12-01','NSX','CLT',201,44);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-12-01','NSX','PJ',203,45);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-12-01','NSX','Aprendiz',3,46);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2025-12-01','NSX','Estatutário/Sócio',6,47);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-01-01','NSX','CLT',206,48);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-01-01','NSX','PJ',214,49);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-01-01','NSX','Aprendiz',3,50);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-01-01','NSX','Estatutário/Sócio',6,51);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-02-01','NSX','CLT',229,52);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-02-01','NSX','PJ',232,53);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-02-01','NSX','Aprendiz',3,54);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-02-01','NSX','Estatutário/Sócio',6,55);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-03-01','NSX','CLT',289,56);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-03-01','NSX','PJ',240,57);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-03-01','NSX','Aprendiz',3,58);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-03-01','NSX','Estatutário/Sócio',6,59);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-04-01','NSX','CLT',306,60);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-04-01','NSX','PJ',253,61);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-04-01','NSX','Aprendiz',3,62);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-04-01','NSX','Estatutário/Sócio',6,63);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-05-01','NSX','CLT',308,64);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-05-01','NSX','PJ',255,65);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-05-01','NSX','Aprendiz',3,66);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-05-01','NSX','Estatutário/Sócio',6,67);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-06-01','NSX','CLT',313,68);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-06-01','NSX','PJ',259,69);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-06-01','NSX','Aprendiz',3,70);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-06-01','NSX','Estatutário/Sócio',6,71);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-07-01','NSX','CLT',318,72);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-07-01','NSX','PJ',260,73);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-07-01','NSX','Aprendiz',3,74);
INSERT INTO public.contract_mix_monthly (month,brand,contract,n,position) VALUES ('2026-07-01','NSX','Estatutário/Sócio',6,75);