-- Nota de interpretacao: campo "Lideranca ?" da base de origem.
--
-- Registro de correcao. Durante a analise interpretei o valor "Nao informado"
-- (269 de 538 pessoas em mar/2026) como campo nao preenchido, e conclui que a
-- metrica de lideranca repousava sobre metade da amostra. A area corrigiu:
-- "Nao informado" significa NAO E LIDER. O campo esta completo.
--
-- Consequencia: a reconstrucao de lideranca e tao confiavel quanto a de
-- headcount, e a divergencia com a serie congelada e erro da serie congelada,
-- nao subcontagem da reconstrucao. O desvio e crescente:
--
--   2026-02   92 congelado  x  91 reconstruido   (-1)
--   2026-03   93            x  90                (-3)
--   2026-04  101            x  90               (-11)
--   2026-05  105            x  93               (-12)
--   2026-06  120            x  95               (-25)
--
-- Impacto em mulheres em lideranca, jun/2026: o numerador e 24 nos dois casos.
-- Congelado 24/120 = 20,0%. Reconstruido 24/95 = 25,3%. O dashboard atual
-- subnotifica a propria diversidade em 5 pontos percentuais.
--
-- Regra para o agregador da etapa 3: lider = "Lideranca ?" igual a "Sim".
-- Qualquer outro valor, inclusive "Nao informado" e vazio, conta como nao lider.

COMMENT ON COLUMN public.monthly_metrics.leaders IS
  'Contagem de lideres. Regra: campo "Lideranca ?" da origem igual a "Sim"; qualquer outro valor, inclusive "Nao informado", e nao lider.';
