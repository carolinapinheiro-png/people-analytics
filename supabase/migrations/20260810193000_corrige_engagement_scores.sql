-- ===========================================================================
-- Correção de engagement_scores contra o arquivo original da pesquisa
-- 10/08/2026 -- autorizada pela Carolina ("pode corrigir, ngm viu ainda")
-- ===========================================================================
--
-- O QUE ACONTECEU
--
-- `engagement_scores` foi carregada digitando os números do deck da onda de
-- jan/2026. Quando o export bruto do Polly foi lido pela primeira vez
-- (src/lib/aggregator/polly-parser.ts), cinco células não bateram.
--
-- POR QUE O ARQUIVO É A FONTE CORRETA, E NÃO O DECK
--
-- O eNPS calculado do bruto reproduz o deck EXATAMENTE nas oito áreas e no
-- total da empresa. Se a população fosse diferente -- respostas que chegaram
-- depois, algum filtro aplicado no deck -- o eNPS teria divergido junto. Ele
-- não divergiu em nenhuma área. Logo são as mesmas 367 pessoas, e o que
-- diverge é a conta, não o dado.
--
-- Duas divergências são grandes demais para arredondamento:
--
--   Marketing, risco de retenção:  21,8%  ->  23,4%   (exato: 23,377%)
--   Legal, satisfação:              8,0   ->   8,7    (exato: 8,667)
--
-- Três são de casa decimal, mas foram corrigidas junto para que o painel e o
-- arquivo não voltem a discordar em lugar nenhum:
--
--   Technology, satisfação:  9,2 -> 9,1   (exato: 9,1495)
--   Customer Service, sat.:  8,9 -> 9,0   (exato: 8,969)
--   Customer Service, risco: 26,0 -> 26,2 (exato: 26,154 -- o deck exibia inteiro)
--   Finance, satisfação:     9,0 -> 9,1   (exato: 9,053)
--
-- COMO OS DELTAS FORAM RECALCULADOS
--
-- `rr_delta` e `sat_delta` comparam jan/26 com jul/25. Corrigir o valor atual
-- sem mexer no delta faria o painel afirmar uma variação que não existe -- o
-- "Δ vs jul/25" passaria a apontar para um valor anterior inventado.
--
-- O valor de jul/25 é mantido fixo (não temos o bruto daquela onda para
-- recalculá-lo, e o erro estava na coluna da onda atual):
--
--     novo_delta = delta_antigo + (valor_novo - valor_antigo)
--
-- Consequência que vale registrar: a satisfação de Legal deixa de aparecer
-- caindo 0,3 e passa a aparecer SUBINDO 0,4. O sinal inverte. Quem viu a
-- leitura anterior de Legal precisa saber disso.
--
-- PARA NÃO REPETIR
--
-- A partir da onda de jul/2026, `survey_cut_scores` é carregada direto do
-- arquivo por src/lib/survey.functions.ts (importSurveyWave). `engagement_scores`
-- só continua existindo por causa de `status` e dos deltas, que não vêm do
-- export. Se as duas voltarem a divergir, a do arquivo é a certa.
-- ===========================================================================

update public.engagement_scores
   set retention_risk = 23.4, rr_delta = 3.2
 where scope = 'Marketing';

update public.engagement_scores
   set retention_risk = 26.2, rr_delta = 8.2, satisfaction = 9.0, sat_delta = -0.1
 where scope = 'Customer Service';

update public.engagement_scores
   set satisfaction = 9.1, sat_delta = 0.1
 where scope = 'Technology';

update public.engagement_scores
   set satisfaction = 9.1, sat_delta = -0.2
 where scope = 'Finance';

update public.engagement_scores
   set satisfaction = 8.7, sat_delta = 0.4
 where scope = 'Legal';
