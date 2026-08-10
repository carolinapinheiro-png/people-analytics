-- ===========================================================================
-- Pesquisa de engajamento: ondas, recortes e drivers
-- ===========================================================================
--
-- POR QUE ESTAS TABELAS EXISTEM
--
-- Até aqui o engajamento vivia em `engagement_scores` e `engagement_drivers`,
-- digitadas a partir do deck. Isso trouxe três limites que só apareceram quando
-- lemos o export bruto do Polly:
--
--   1. Sem `n` por recorte. Legal aparecia com eNPS 47 sem que ninguém soubesse
--      que são 15 respostas -- uma pessoa a mais move o número em 7 pontos.
--   2. Sem os recortes que a pesquisa coleta: gestor/contribuidor, marca e
--      tempo de casa nunca chegaram ao painel porque não estavam no deck.
--   3. Uma onda nova exigia redigitar ~60 números sem errar.
--
-- Estas tabelas guardam o AGREGADO produzido por src/lib/aggregator/polly-*.ts
-- a partir do arquivo original. O bruto não é gravado (ver LGPD abaixo).
--
-- ---------------------------------------------------------------------------
-- LGPD -- O QUE DELIBERADAMENTE NÃO ENTRA
-- ---------------------------------------------------------------------------
-- Nenhuma resposta individual, e NENHUM comentário livre.
--
-- Os comentários são o campo mais rico do export e o mais perigoso: em jan/26
-- há respostas que descrevem a própria estrutura do time com detalhe suficiente
-- para identificar quem escreveu -- por gente que acreditava estar anônima.
-- Gravar isso converteria uma pesquisa anônima numa base identificável, e não
-- há tela neste painel que justifique esse risco.
--
-- O menor grão gravado é a contagem de um recorte. `n` fica visível sempre; a
-- NOTA é escondida abaixo de 5 respostas para quem não tem perfil de RH, e essa
-- regra é aplicada no servidor (polly-survey.ts / applySuppression), não aqui:
-- o banco guarda o valor real para que a regra possa mudar sem recarregar tudo.
-- ===========================================================================

create table if not exists public.survey_waves (
  wave          text primary key,           -- 'jul_2025', 'jan_2026'
  label         text not null,              -- 'Julho/25'
  -- Data de referência da onda. jul/25 foi aplicada em duas partes, com um mês
  -- de diferença (eNPS em junho, drivers em julho); a área trata como uma
  -- pesquisa só e a chama de Julho/25. Duas linhas aqui criariam duas ondas
  -- onde existe uma, e o gráfico de movimento mostraria um degrau inventado.
  reference_date date not null,
  respondents   integer not null default 0,
  -- Elegíveis no momento da aplicação, para calcular participação. Nem sempre
  -- conhecido: null significa "não sabemos", não "ninguém".
  eligible      integer,
  notes         text,
  loaded_at     timestamptz not null default now(),
  loaded_by     text
);

comment on table public.survey_waves is
  'Ondas da pesquisa de engajamento. Uma linha por onda, mesmo quando a coleta foi feita em duas etapas.';

-- ---------------------------------------------------------------------------
-- Recortes: eNPS, risco e satisfação por dimensão
-- ---------------------------------------------------------------------------
create table if not exists public.survey_cut_scores (
  wave        text not null references public.survey_waves(wave) on delete cascade,
  -- 'company' | 'area' | 'funcao' | 'marca' | 'tempo'
  cut_type    text not null,
  cut_value   text not null,
  n           integer not null,
  enps        integer,
  promotores  integer,
  passivos    integer,
  detratores  integer,
  risco       numeric(5,1),
  satisfacao  numeric(4,1),
  primary key (wave, cut_type, cut_value)
);

comment on column public.survey_cut_scores.n is
  'Pessoas no recorte, não respostas válidas. É o n que decide a supressão por sigilo.';
comment on column public.survey_cut_scores.risco is
  'Percentual que respondeu 6 ou menos em "permaneceria com oferta idêntica". O corte <=6 é o único que reproduz os 16,6% publicados em jan/26.';

-- ---------------------------------------------------------------------------
-- Drivers por recorte
-- ---------------------------------------------------------------------------
create table if not exists public.survey_driver_scores (
  wave      text not null references public.survey_waves(wave) on delete cascade,
  driver    text not null,
  question  text not null,
  cut_type  text not null,
  cut_value text not null,
  n         integer not null,
  score     numeric(4,2),
  primary key (wave, driver, question, cut_type, cut_value)
);

-- ---------------------------------------------------------------------------
-- Associação de cada pergunta com o eNPS individual
-- ---------------------------------------------------------------------------
--
-- Só existe quando a onda traz eNPS e drivers no mesmo questionário -- caso de
-- jan/26 em diante. Em jul/25 as duas metades foram aplicadas separadamente e
-- não há como ligar a resposta de uma pessoa nas duas.
--
-- ISTO NÃO É CAUSA. Todas as respostas vêm da mesma pessoa no mesmo momento;
-- quem está satisfeito marca alto em tudo. Serve para ordenar perguntas entre
-- si, não para prometer que mexer numa levanta o eNPS.
create table if not exists public.survey_driver_importance (
  wave     text not null references public.survey_waves(wave) on delete cascade,
  driver   text not null,
  question text not null,
  r        numeric(5,3) not null,
  score    numeric(4,2) not null,
  n        integer not null,
  primary key (wave, driver, question)
);

comment on table public.survey_driver_importance is
  'Correlação de cada pergunta com o eNPS da mesma pessoa. Associação, não causa: viés de método comum.';

-- ---------------------------------------------------------------------------
-- Acesso
-- ---------------------------------------------------------------------------
-- Mesmo padrão do resto do painel: sem policy de SELECT, leitura só pelas
-- server functions com service_role. Aqui o motivo é específico: a regra de
-- supressão por n depende do perfil de quem consulta, e isso não dá para
-- expressar numa policy sem duplicar a lógica de permissões no SQL.
alter table public.survey_waves             enable row level security;
alter table public.survey_cut_scores        enable row level security;
alter table public.survey_driver_scores     enable row level security;
alter table public.survey_driver_importance enable row level security;

create index if not exists idx_cut_scores_wave_type
  on public.survey_cut_scores (wave, cut_type);
create index if not exists idx_driver_scores_wave_cut
  on public.survey_driver_scores (wave, cut_type, cut_value);
