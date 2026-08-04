-- Modelo de trabalho: refresh com a base de ago/2026 (fechamento de julho) e,
-- principalmente, a REGRA DE CONSOLIDACAO escrita de forma explicita.
--
-- A coluna "Modelo de Jornada de Trabalho" aparece 5 vezes no Talent Mobility.
-- A regra correta e: varrer as 5 e pegar o primeiro valor que seja de fato um
-- modelo (Remoto* / Hibrido / Presencial), PULANDO "Nao informado" e vazio.
--
-- Cuidado: "Nao informado" e um TEXTO, nao celula vazia. Uma leitura ingenua do
-- tipo "primeiro valor nao-vazio" engole "Nao informado" como se fosse resposta
-- e infla o desconhecido de ~5% para ~39%. Foi exatamente esse o erro que quase
-- nos fez regravar o snapshot com dado pior. Se for reimplementar, teste contra
-- estes numeros.
--
-- "Remoto sem registro de ponto" e "Remoto com registro de ponto" colapsam em
-- "Remoto" (o registro de ponto e questao trabalhista, nao modelo de trabalho).
--
-- Correcoes desta versao, alem dos numeros novos:
--   * COMPLIANCE (1) e Geral (1) nao existiam no banco -- o total por
--     departamento (647) nao fechava com o overall (649). Agora 643 = 643.
--   * Ativo = sem data de desligamento valida. Company-wide (NSX + Betfair BR +
--     Flutter International), por isso 643 e nao os 581 do headcount NSX.
DELETE FROM public.work_model_snapshot;
INSERT INTO public.work_model_snapshot (snapshot_month,scope_type,scope,model,n,position) VALUES
('2026-07-01','overall','all','Remoto',428,0),
('2026-07-01','overall','all','Presencial',166,1),
('2026-07-01','overall','all','Híbrido',14,2),
('2026-07-01','overall','all','Não informado',35,3),
('2026-07-01','department','TECHNOLOGY','Remoto',164,4),
('2026-07-01','department','TECHNOLOGY','Presencial',8,5),
('2026-07-01','department','TECHNOLOGY','Não informado',3,6),
('2026-07-01','department','OPERATION','Presencial',97,7),
('2026-07-01','department','OPERATION','Remoto',45,8),
('2026-07-01','department','OPERATION','Híbrido',5,9),
('2026-07-01','department','OPERATION','Não informado',3,10),
('2026-07-01','department','MARKETING','Remoto',80,11),
('2026-07-01','department','MARKETING','Presencial',9,12),
('2026-07-01','department','MARKETING','Híbrido',2,13),
('2026-07-01','department','MARKETING','Não informado',6,14),
('2026-07-01','department','COMMERCIAL','Remoto',43,15),
('2026-07-01','department','COMMERCIAL','Presencial',9,16),
('2026-07-01','department','COMMERCIAL','Não informado',8,17),
('2026-07-01','department','FINANCE','Presencial',25,18),
('2026-07-01','department','FINANCE','Remoto',13,19),
('2026-07-01','department','FINANCE','Híbrido',6,20),
('2026-07-01','department','FINANCE','Não informado',2,21),
('2026-07-01','department','PRODUCT','Remoto',38,22),
('2026-07-01','department','PRODUCT','Não informado',7,23),
('2026-07-01','department','HR','Remoto',17,24),
('2026-07-01','department','HR','Presencial',5,25),
('2026-07-01','department','HR','Não informado',1,26),
('2026-07-01','department','LEGAL & COMPLIANCE','Remoto',8,27),
('2026-07-01','department','LEGAL & COMPLIANCE','Presencial',8,28),
('2026-07-01','department','LEGAL & COMPLIANCE','Híbrido',1,29),
('2026-07-01','department','LEGAL & COMPLIANCE','Não informado',3,30),
('2026-07-01','department','PORTO','Remoto',17,31),
('2026-07-01','department','PORTO','Não informado',2,32),
('2026-07-01','department','DIRETORIA','Presencial',4,33),
('2026-07-01','department','DIRETORIA','Remoto',2,34),
('2026-07-01','department','COMPLIANCE','Remoto',1,35),
('2026-07-01','department','Geral','Presencial',1,36);
