-- Modelo de trabalho (remoto / hibrido / presencial). A Carolina apontou que o
-- dado JA existe na base: coluna "Modelo de Jornada de Trabalho" do Talent
-- Mobility (repartida em 5 blocos; consolidamos o primeiro valor informado por
-- pessoa). Snapshot agregado dos ATIVOS (sem data de desligamento), igual ao
-- padrao do span: so contagens por modelo, no total e por departamento. Sem nomes.
CREATE TABLE IF NOT EXISTS public.work_model_snapshot (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_month date NOT NULL,
  scope_type     text NOT NULL,     -- 'overall' | 'department'
  scope          text NOT NULL,     -- 'all' ou nome do depto
  model          text NOT NULL,     -- 'Remoto' | 'Presencial' | 'Híbrido' | 'Não informado'
  n              integer NOT NULL,
  position       integer DEFAULT 0,
  loaded_at      timestamptz DEFAULT now(),
  CONSTRAINT work_model_snapshot_unique UNIQUE (snapshot_month, scope_type, scope, model)
);

ALTER TABLE public.work_model_snapshot ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.work_model_snapshot TO authenticated;
GRANT ALL ON public.work_model_snapshot TO service_role;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='work_model_snapshot' AND policyname='auth read work model') THEN
    CREATE POLICY "auth read work model" ON public.work_model_snapshot FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.work_model_snapshot IS
  'Modelo de trabalho (Talent Mobility, coluna Modelo de Jornada de Trabalho). So agregados de ativos.';

-- Seed (jul/2026), consolidado dos ativos do Talent Mobility.
DELETE FROM public.work_model_snapshot;
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','overall','all','Remoto',429,0);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','overall','all','Presencial',170,1);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','overall','all','Híbrido',13,2);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','overall','all','Não informado',37,3);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$TECHNOLOGY$$,'Remoto',164,4);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$TECHNOLOGY$$,'Presencial',8,5);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$TECHNOLOGY$$,'Não informado',4,6);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$OPERATION$$,'Remoto',45,7);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$OPERATION$$,'Presencial',100,8);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$OPERATION$$,'Híbrido',5,9);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$OPERATION$$,'Não informado',3,10);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$MARKETING$$,'Remoto',80,11);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$MARKETING$$,'Presencial',10,12);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$MARKETING$$,'Híbrido',2,13);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$MARKETING$$,'Não informado',6,14);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$COMMERCIAL$$,'Remoto',44,15);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$COMMERCIAL$$,'Presencial',9,16);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$COMMERCIAL$$,'Não informado',8,17);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$FINANCE$$,'Remoto',13,18);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$FINANCE$$,'Presencial',25,19);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$FINANCE$$,'Híbrido',5,20);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$FINANCE$$,'Não informado',3,21);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$PRODUCT$$,'Remoto',37,22);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$PRODUCT$$,'Não informado',7,23);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$HR$$,'Remoto',17,24);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$HR$$,'Presencial',5,25);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$HR$$,'Não informado',1,26);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$LEGAL & COMPLIANCE$$,'Remoto',8,27);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$LEGAL & COMPLIANCE$$,'Presencial',8,28);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$LEGAL & COMPLIANCE$$,'Híbrido',1,29);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$LEGAL & COMPLIANCE$$,'Não informado',3,30);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$PORTO$$,'Remoto',18,31);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$PORTO$$,'Não informado',2,32);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$DIRETORIA$$,'Remoto',2,33);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$DIRETORIA$$,'Presencial',4,34);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$Geral$$,'Presencial',1,35);
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES ('2026-07-01','department',$$COMPLIANCE$$,'Remoto',1,36);