-- ===========================================================================
-- A ASSOCIAÇÃO COM O eNPS PASSA A TER RECORTE
-- ===========================================================================
-- `survey_driver_importance` guardava uma linha por pergunta, sem recorte, e a
-- tela virou isso em "a associação com o eNPS não existe por área". Era falso:
-- a correlação exige eNPS e nota da pergunta na MESMA pessoa, e o export traz
-- as duas junto com a área. Só nunca tinha sido agrupada.
--
-- É o quarto caso do mesmo formato neste painel -- uma dimensão nunca agregada
-- anunciada como impossível.
--
-- O default 'company' preserva as linhas que já existem: elas SÃO da empresa.
ALTER TABLE survey_driver_importance
  ADD COLUMN IF NOT EXISTS cut_type text NOT NULL DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS cut_value text NOT NULL DEFAULT 'company';

-- A chave precisa do recorte, senão a linha de Technology sobrescreve a da
-- empresa na mesma pergunta.
ALTER TABLE survey_driver_importance DROP CONSTRAINT IF EXISTS survey_driver_importance_pkey;
ALTER TABLE survey_driver_importance
  ADD PRIMARY KEY (wave, cut_type, cut_value, driver, question);
