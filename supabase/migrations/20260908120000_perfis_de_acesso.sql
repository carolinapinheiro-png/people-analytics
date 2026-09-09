-- Perfis de acesso nomeados, editáveis, com exceção por pessoa.
--
-- ===========================================================================
-- ISTO NÃO É A VOLTA DO QUE FOI REMOVIDO
-- ===========================================================================
-- Em 31/08 o perfil deixou de ser escolhido (ver 20260831235900). A razão está
-- lá e continua boa: os cinco perfis eram um ENUM FIXO cujas abas moravam no
-- código, e escolher o perfil e depois ajustar os campos ao lado deixava dois
-- modelos disputando a mesma pergunta.
--
-- O que entra aqui é outra coisa: uma TABELA que a Carolina edita. "HRBP" deixa
-- de ser um rótulo com abas escritas por mim e passa a ser um cadastro com as
-- abas que ela escolheu. A diferença prática: hoje, para dar o mesmo conjunto a
-- cinco HRBPs, são cinco cadastros iguais editados à mão -- e não há como mudar
-- os cinco depois.
--
-- O defeito do modelo antigo era o rótulo fingir ser decisão enquanto a decisão
-- morava nos campos ao lado. Aqui o perfil É a decisão, e o campo ao lado, quando
-- preenchido, aparece MARCADO COMO EXCEÇÃO. Um dos dois manda, e a tela diz qual.
--
-- ===========================================================================
-- NULO PASSA A SIGNIFICAR "HERDA", E SÓ QUANDO HÁ PERFIL
-- ===========================================================================
-- `can_see_individual` já foi de três estados, e o null significava "conforme o
-- perfil". A migração de 31/08 o esvaziou porque o perfil tinha deixado de ser
-- escolhido -- o null apontava para uma escolha que não existia mais.
--
-- Agora existe de novo, e o null volta a ter dono: com `profile_id` preenchido,
-- null é "o que o perfil disser". SEM `profile_id`, nada muda -- é o
-- comportamento de hoje, e os nove cadastros atuais ficam exatamente como estão.
--
-- ===========================================================================
-- O QUE NÃO MUDA
-- ===========================================================================
-- A coluna `profile` continua existindo e continua sendo o que as 26 checagens
-- de `isGlobalProfile` consultam. Ela segue DERIVADA -- agora das chaves que o
-- perfil define, ou da exceção da pessoa. Nenhum dos 26 pontos é tocado.
create table if not exists public.access_profiles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  -- As três perguntas que um perfil de acesso responde. Ver perfil-derivado.ts.
  ve_empresa_toda boolean not null default false,
  administra_usuarios boolean not null default false,
  ve_individual boolean not null default false,
  -- A lista de abas do perfil. Vazia/nula = o preset do perfil derivado, que é
  -- o comportamento de quem não tem perfil nenhum.
  tabs text[],
  sub_tabs text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.access_profiles is
  'Perfis de acesso nomeados e editáveis. O cadastro aponta para um; campo preenchido no cadastro é EXCEÇÃO e vence o perfil.';
comment on column public.access_profiles.tabs is
  'Abas do perfil. Vazia = usa o preset derivado das três chaves.';

alter table public.allowed_emails
  add column if not exists profile_id uuid references public.access_profiles(id) on delete restrict;

comment on column public.allowed_emails.profile_id is
  'O perfil de acesso. Nulo = cadastro avulso, com as chaves e abas próprias (comportamento anterior a 08/09).';
comment on column public.allowed_emails.can_see_individual is
  'Com profile_id preenchido, NULO = herda do perfil. Sem profile_id, nulo não ocorre (ver 20260831235900).';

-- `on delete restrict` de propósito: apagar um perfil com gente dentro
-- silenciosamente devolveria essas pessoas ao preset, mudando o que elas
-- enxergam sem ninguém pedir. Quem quiser apagar precisa primeiro mover.

create index if not exists allowed_emails_profile_id_idx
  on public.allowed_emails (profile_id);

alter table public.access_profiles enable row level security;

-- ===========================================================================
-- `drop policy if exists` ANTES DE CADA `create policy`
-- ===========================================================================
-- `create policy` não aceita `if not exists`. Sem o drop, a SEGUNDA execução
-- deste arquivo falha em "policy already exists" -- e, se quem executa roda o
-- arquivo inteiro numa transação, o `create table` do começo é desfeito junto.
--
-- O resultado é o pior possível: parece que rodou, e não sobrou tabela
-- nenhuma. Foi o que provavelmente aconteceu aqui, e a tela passou dois dias
-- dizendo "a tabela existe, é só o cache" -- porque eu tinha escrito uma
-- migração que só funciona na primeira tentativa.
--
-- Segunda tentativa é a regra, não a exceção: toda migração tem de poder rodar
-- de novo.
drop policy if exists "perfis: leitura para autenticados" on public.access_profiles;
drop policy if exists "perfis: escrita só para quem administra usuários" on public.access_profiles;

-- Só quem administra usuários mexe em perfil -- decisão da Carolina, 08/09.
-- Perfil é a chave-mestra: quem edita perfil edita o acesso de todo mundo que
-- está nele, de uma vez.
create policy "perfis: leitura para autenticados"
  on public.access_profiles for select
  to authenticated
  using (true);

create policy "perfis: escrita só para quem administra usuários"
  on public.access_profiles for all
  to authenticated
  using (
    exists (
      select 1 from public.allowed_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
        and ae.profile = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.allowed_emails ae
      where lower(ae.email) = lower(auth.jwt() ->> 'email')
        and ae.profile = 'admin'
    )
  );
