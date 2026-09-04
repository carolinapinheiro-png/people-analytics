-- A marca de "li o DETALHE desta pessoa com o código atual".
--
-- `job_title_em` marcava a leitura do detalhe, e `custom_fields != null` virou
-- o critério da fila. Os dois envelheceram junto: quando a carga passou a
-- precisar de `relationship` e `uf`, que só existem no detalhe, as 200 pessoas
-- que já tinham `custom_fields` ficaram fora da fila para sempre -- e os campos
-- novos nasceram nulos e assim continuariam.
--
-- É a terceira vez que isto acontece pelo mesmo motivo: o critério da fila
-- codifica "já perguntei" em termos de UM campo que existia na época. Uma
-- marca própria, sem significado de conteúdo, quebra o ciclo -- para requerer
-- releitura basta zerá-la.
alter table public.convenia_pessoas
  add column if not exists detalhe_em timestamptz;

comment on column public.convenia_pessoas.detalhe_em is
  'Quando o DETALHE desta pessoa foi lido com o código atual. Critério da fila de releitura: zerar esta coluna reenfileira todo mundo. Não confundir com job_title_em, que marca a pergunta pelo cargo.';

-- Quem já tem custom_fields foi lido, mas por código que não trazia
-- relationship nem uf. Nasce nulo de propósito: a fila tem de reprocessá-los.
