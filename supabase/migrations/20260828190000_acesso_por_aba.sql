-- Abas e sub-abas escolhidas por PESSOA, e não só herdadas do perfil.
--
-- ===========================================================================
-- POR QUE ISTO SUBSTITUI O PRESET EM VEZ DE SUBTRAIR DELE
-- ===========================================================================
-- `extra_tabs` só SOMA, por decisão explícita: "duas listas, uma somando e
-- outra subtraindo, produzem combinações que ninguém consegue prever lendo o
-- cadastro". A razão continua boa.
--
-- Mas ela impedia o caso real: liberar um HRBP só para Engajamento nesta onda
-- e ampliar depois. Reduzir era impossível.
--
-- A saída não é acrescentar uma lista de subtração -- seria exatamente a
-- combinação que se evitou. É deixar UMA lista mandar por vez:
--
--   tabs vazio/nulo ....... vale o preset do perfil, com `extra_tabs`
--                           somando. Comportamento de hoje, intacto.
--   tabs preenchido ....... é EXATAMENTE aquilo. Nem o preset, nem extras.
--
-- Quem lê o cadastro vê o que a pessoa enxerga, sem fazer conta. Os nove
-- usuários de hoje têm `extra_tabs` vazio e vão ficar com `tabs` vazio: nada
-- muda para nenhum deles.
--
-- ===========================================================================
-- SUB-ABAS SEGUEM A MESMA REGRA
-- ===========================================================================
-- Lista achatada, sem dizer de qual aba cada uma é: os identificadores são
-- únicos entre as abas ('engajamento', 'custos', 'desligamentos'...), e
-- guardar o par aba/sub-aba criaria um formato que só esta tabela entende.
--
-- ATENÇÃO ao alcance: hoje a sub-aba de Experiência é barrada NO SERVIDOR --
-- os dados de Onboarding e Inclusão não entram na resposta de quem não pode
-- vê-los. Para as sub-abas de Compensação e Atrição o corte ainda é de
-- navegação; o dado é buscado por funções próprias que precisam passar a
-- conferir esta lista. Enquanto não passarem, esconder ali é esconder na
-- tela, e "escondido por CSS continua entregue".
alter table public.allowed_emails
  add column if not exists tabs text[],
  add column if not exists sub_tabs text[];

comment on column public.allowed_emails.tabs is
  'Abas desta pessoa. Vazio/nulo = preset do perfil + extra_tabs. Preenchido = exatamente esta lista. Ver src/lib/permissions.ts.';
comment on column public.allowed_emails.sub_tabs is
  'Sub-abas desta pessoa, mesma regra de `tabs`. Experiência é barrada no servidor; Compensação e Atrição ainda são corte de navegação.';
