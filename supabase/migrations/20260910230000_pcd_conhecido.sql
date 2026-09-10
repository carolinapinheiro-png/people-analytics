-- O denominador honesto das cotas legais.
--
-- ===========================================================================
-- "0,8% PCD" RESPONDE A PERGUNTA ERRADA
-- ===========================================================================
-- O cartão divide `pcd` pelo HEADCOUNT, então "0,8%" se lê como "0,8% da
-- empresa é PCD". Não é isso que o número sabe: o campo "Considera PCD" é
-- pouco preenchido, e 5 é o total entre os POUCOS que responderam.
--
-- A carga já calcula `pcd_conhecido` -- quantas pessoas têm o campo respondido
-- -- desde 09/09. Ela nunca teve onde gravar: o código tem um comentário
-- dizendo "pcd_conhecido nao tem coluna", e o valor era descartado a cada
-- execução. É o mesmo defeito do dia inteiro: a carga sabe, e a tela não
-- recebe.
--
-- Com a coluna, a tela pode dizer "5 de 62 que responderam" em vez de um
-- percentual sobre uma base que não é a dele. Numa cota legal, a diferença
-- entre "quase ninguém é PCD" e "quase ninguém respondeu" é a diferença entre
-- um problema de inclusão e um problema de cadastro.
alter table public.monthly_metrics
  add column if not exists pcd_conhecido integer;

comment on column public.monthly_metrics.pcd_conhecido is
  'Quantas pessoas do mes tem o campo "Considera PCD" respondido. E o denominador de pcd -- headcount NAO e, porque o campo e pouco preenchido. NULL = mes gravado antes desta coluna existir.';

-- Sem DEFAULT 0, pelo mesmo motivo de sempre: zero aqui diria "ninguem
-- respondeu", que e uma afirmacao sobre o cadastro. `null` diz "esta linha e
-- anterior a coluna", e a tela sabe mostrar o percentual antigo com a ressalva
-- em vez de dividir por zero.
