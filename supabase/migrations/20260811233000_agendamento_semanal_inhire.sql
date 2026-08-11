-- ===========================================================================
-- Agendamento semanal da sincronização com o InHire
-- ===========================================================================
--
-- POR QUE ISTO NÃO FOI PARA O GITHUB ACTIONS
--
-- Eu tinha concluído que o Postgres não conseguia se agendar sozinho aqui.
-- A conclusão veio de consultar `pg_extension` -- que lista as extensões
-- INSTALADAS -- e não encontrar `pg_cron` nem `pg_net`.
--
-- A consulta certa era `pg_available_extensions`. As duas estavam disponíveis o
-- tempo todo, apenas não instaladas, e instalar é uma linha.
--
-- A diferença prática é grande: o caminho do GitHub Actions exigia login no
-- GitHub, dois segredos cadastrados à mão em dois cofres diferentes, e os dois
-- teriam que permanecer iguais para sempre. Este caminho não exige nada de
-- ninguém.
--
-- Fica a lição, gêmea da do `statusHistory` do InHire: **ausente de onde eu
-- olhei não é ausente.** Antes de concluir que algo não existe, vale conferir
-- se a pergunta feita é a pergunta pretendida.
--
-- ---------------------------------------------------------------------------
-- POR QUE O SEGREDO MORA NUMA TABELA
--
-- A rota `/api/cron/inhire-sync` precisa conferir um segredo, e o agendador
-- precisa enviá-lo. Se cada lado tivesse a própria cópia (variável de ambiente
-- de um lado, job do outro), toda rotação viraria uma operação manual
-- coordenada -- e o modo de falha é silencioso: a sincronização simplesmente
-- para, e ninguém percebe até reparar que o painel está velho.
--
-- Numa tabela existe UMA cópia. Os dois lados leem a mesma linha e não há como
-- divergirem.
--
-- O valor é gerado pelo próprio Postgres com `gen_random_bytes` e inserido
-- SEM `returning`: ele nunca aparece em tela, em log de chat, nem em arquivo do
-- repositório. Ninguém precisa vê-lo para que funcione -- inclusive eu.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Sem NENHUMA política de RLS, de propósito: só a chave de serviço enxerga.
-- Mesmo padrão já usado para os dados sensíveis deste projeto.
create table if not exists public.service_secrets (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
alter table public.service_secrets enable row level security;
revoke all on public.service_secrets from anon, authenticated;

comment on table public.service_secrets is
  'Segredos de servico. SEM politica de RLS de proposito: so a chave de servico le. Nunca expor por server function nem por view.';

insert into public.service_secrets (name, value)
select 'cron_secret', encode(gen_random_bytes(32), 'hex')
on conflict (name) do nothing;

insert into public.service_secrets (name, value)
values ('app_url', 'https://peopleanalyticsflutterbr.lovable.app')
on conflict (name) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- O job
--
-- Semanal, e não diário: cada execução gasta ~161 requisições do balde do
-- InHire, que é POR CONTA e compartilhado com o conector MCP do time de
-- recrutamento. Vaga não muda tanto ao longo de um dia a ponto de pagar esse
-- custo todo dia. Se a frequência precisar subir, o caminho é webhook em vez de
-- varredura -- não encurtar o intervalo.
--
-- Segunda 09:00 UTC = 06:00 em Brasília (sem horário de verão no Brasil, o
-- deslocamento é fixo). Antes do expediente: balde livre, e o número já pronto
-- quando alguém abrir o painel.
-- ---------------------------------------------------------------------------
select cron.unschedule(jobid) from cron.job where jobname = 'sync-inhire-semanal';

select cron.schedule(
  'sync-inhire-semanal',
  '0 9 * * 1',
  $job$
    select net.http_post(
      url := (select value from public.service_secrets where name = 'app_url')
             || '/api/cron/inhire-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Cabecalho, nunca query string: URL vaza para log de acesso,
        -- historico de navegador e cabecalho Referer.
        'X-Cron-Secret', (select value from public.service_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      -- A carga leva ~40s (161 requisicoes espacadas em 150ms). 5 minutos da
      -- folga larga sem deixar uma chamada pendurada para sempre.
      timeout_milliseconds := 300000
    );
  $job$
);

-- ---------------------------------------------------------------------------
-- Se a chamada estourar o tempo, a sincronizacao NAO se perde: ela ja esta
-- rodando do lado do servidor e termina sozinha. O pg_net so deixa de ver a
-- resposta. E a carga e idempotente, entao a execucao seguinte corrige
-- qualquer gravacao que tenha ficado pela metade.
--
-- Para conferir execucoes:
--   select * from cron.job_run_details where jobname = 'sync-inhire-semanal'
--     order by start_time desc limit 10;
--   select * from net._http_response order by created desc limit 10;
--   select * from integration_sync_log where provider = 'inhire'
--     order by started_at desc limit 10;
-- ---------------------------------------------------------------------------
