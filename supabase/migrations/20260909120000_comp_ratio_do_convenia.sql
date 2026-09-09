-- `comp_ratio` deixa de vir de planilha e passa a ser gravada pela carga.
--
-- ===========================================================================
-- O QUE ISTO CONSERTA
-- ===========================================================================
-- A tabela foi carregada de uma planilha e parou em junho. O efeito não é
-- "dado velho": é dado velho com cara de atual. Quem entrou depois não existe,
-- quem saiu continua lá, quem foi promovido aparece na faixa antiga -- e nada
-- na tela distingue isso de um cadastro correto.
--
-- O Convenia tem salário para 648 dos 649 ativos, e já é de lá que vêm área,
-- time, cargo, nível e vínculo. A única coisa que ele NÃO tem é a faixa: ponto
-- médio é decisão da empresa, não fato sobre a pessoa. Por isso `salary_bands`
-- continua sendo a única tabela de política, e é o denominador da conta.
-- Decisão da Carolina, 09/09, depois de medir a alternativa (derivar o ponto
-- médio da mediana dos pares) e ver que ela dá 1,00 para um time inteiro mal
-- pago.
--
-- ===========================================================================
-- `convenia_id` É O QUE PERMITE NÃO APAGAR NADA
-- ===========================================================================
-- Sem chave, a única carga possível seria apagar tudo e reescrever. E a carga
-- lê o detalhe individual em lotes de 200 por execução: uma reescrita
-- apagaria quem ainda não foi lido naquela rodada. Já aconteceu neste painel,
-- com outro nome.
--
-- Com `convenia_id` único, cada pessoa é um upsert. Quem não entrou na rodada
-- fica como está, e nada some.
alter table public.comp_ratio
  add column if not exists convenia_id text,
  add column if not exists band_family text,
  add column if not exists band_midpoint numeric(12,2),
  add column if not exists job_type_family_convenia text,
  -- Preenchido = não há comp-ratio, e esta coluna diz POR QUE. As duas causas
  -- exigem ações opostas: cadastro incompleto é o RH corrigir o Convenia;
  -- faixa inexistente é o Comp & Ben cadastrar a banda. Um nulo sem motivo se
  -- lê como falha de carga, e manda arrumar o que já está certo.
  add column if not exists sem_banda text,
  add column if not exists atualizado_em timestamptz;

comment on column public.comp_ratio.convenia_id is
  'Chave da pessoa no Convenia. Permite upsert por pessoa em vez de apagar e reescrever -- a carga lê o detalhe em lotes, e reescrever apagaria quem ficou de fora da rodada.';
comment on column public.comp_ratio.sem_banda is
  'Por que esta pessoa não tem comp-ratio. Nulo = tem. Ver comp-ratio-convenia.ts.';

-- Índice único PARCIAL: as linhas que vieram da planilha não têm
-- `convenia_id`, e um índice único comum recusaria a segunda delas. Elas
-- continuam existindo até a primeira carga sobrescrever cada uma.
create unique index if not exists comp_ratio_convenia_id_idx
  on public.comp_ratio (convenia_id) where convenia_id is not null;

-- ===========================================================================
-- O VÍNCULO PRECISA SER GUARDADO
-- ===========================================================================
-- `relationship` (CLT, Pessoa Jurídica, Aprendiz...) vem na LISTAGEM, de graça,
-- em toda execução -- e não estava sendo persistido. Sem ele não há como
-- escolher a linha da banda, que é chaveada por (família, contrato, nível).
alter table public.convenia_pessoas
  add column if not exists relationship text;

comment on column public.convenia_pessoas.relationship is
  'Vínculo como o Convenia manda: "CLT", "Pessoa Jurídica", "Aprendiz". Traduzido para CLT/PJ só na hora de casar com a banda.';
