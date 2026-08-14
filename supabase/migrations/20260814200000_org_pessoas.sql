-- Organograma mínimo: quem é cada e-mail e onde ele está na cadeia.
--
-- ===========================================================================
-- PARA QUE ISTO EXISTE
-- ===========================================================================
-- A camada N decide, na aba de Salários, de quem cada pessoa vê a
-- remuneração. Até agora ela era DIGITADA no cadastro de acesso, o que tem
-- dois problemas -- e o segundo é o que pesa:
--
--   1. Trabalho manual a cada usuário novo.
--   2. Ela envelhece calada. Quem é promovido continua com o acesso da camada
--      antiga até alguém lembrar de editar, e nada na tela indica que aquele
--      campo ficou velho.
--
-- O Convenia já traz o supervisor de cada pessoa e já sincroniza sozinho.
-- Derivar a camada daí faz o acesso acompanhar o organograma sem ninguém
-- tocar em nada.
--
-- ===========================================================================
-- POR QUE UMA TABELA NOVA, E NÃO MAIS COLUNAS EM convenia_pessoas
-- ===========================================================================
-- `convenia_pessoas` guarda gênero e raça -- dado sensível, que existe só
-- para virar agregado e nunca é lido por pessoa. Esta tabela é consultada
-- POR PESSOA (o cadastro pergunta "quem é este e-mail?"). Misturar as duas
-- faria uma consulta legítima de organograma passar pela mesma porta que o
-- dado demográfico.
--
-- Aqui só entra o necessário para responder "quem é este e-mail, de que área,
-- em que camada". Sem salário, sem CPF, sem data de nascimento.
create table if not exists public.org_pessoas (
  convenia_id   text primary key,
  email         text,
  supervisor_id text,
  department    text,
  /** Rótulo calculado: "N-2", "N-3"... null = cadeia quebrada ou em ciclo. */
  camada        text,
  /** Profundidade a partir do topo local. É ela que a regra compara. */
  profundidade  int,
  atualizado_em timestamptz not null default now()
);

-- A busca do cadastro é sempre por e-mail, e sem diferenciar caixa.
create unique index if not exists org_pessoas_email_idx
  on public.org_pessoas (lower(email)) where email is not null;

comment on table public.org_pessoas is
  'Organograma mínimo vindo do Convenia. Alimenta a camada N do controle de acesso — ver src/lib/organograma.ts.';

-- RLS ligada e NENHUMA policy: só o service_role lê.
--
-- Mesmo padrão de service_secrets e convenia_leavers. É organograma, não é
-- segredo, mas relaciona e-mail a gestor para a empresa inteira -- e essa
-- relação, exposta ao cliente, é um mapa de quem reporta a quem que ninguém
-- pediu para publicar.
alter table public.org_pessoas enable row level security;
