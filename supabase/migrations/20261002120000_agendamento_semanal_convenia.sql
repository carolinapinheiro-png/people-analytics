-- ===========================================================================
-- Agendamento semanal da carga do Convenia
-- ===========================================================================
--
-- POR QUE ESTE ARQUIVO EXISTE SÓ AGORA
--
-- O job `sync-convenia-semanal` roda em produção desde setembro, mas foi
-- criado direto no banco, sem migração. A auditoria de 02/10/2026 achou isso:
-- num banco novo (troca de plataforma, restauração de backup), o InHire
-- voltaria a sincronizar sozinho e o Convenia não -- e nada avisaria. O painel
-- só envelheceria.
--
-- Este arquivo ESPELHA o job de produção, conferido em 02/10/2026 contra
-- `cron.job`: mesmo nome, mesma agenda, mesmo comando. Rodar de novo em
-- produção é inofensivo: desagenda o job pelo nome e agenda igual.
--
-- Depende do que a migração 20260811233000_agendamento_semanal_inhire.sql
-- cria: as extensões pg_cron e pg_net e a tabela `service_secrets`, com
-- `app_url` e `cron_secret`. Os `if not exists` abaixo só garantem a ordem
-- num banco montado do zero.
--
-- ---------------------------------------------------------------------------
-- POR QUE 09:30, MEIA HORA DEPOIS DO INHIRE
--
-- Segunda 09:30 UTC = 06:30 em Brasília. As duas cargas escrevem em tabelas
-- diferentes; o intervalo é precaução, não dependência -- um problema de rede
-- não derruba as duas ao mesmo tempo. Ver o comentário da rota em
-- src/routes/api/cron/convenia-sync.ts.
-- ===========================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'sync-convenia-semanal';

select cron.schedule(
  'sync-convenia-semanal',
  '30 9 * * 1',
  $job$
    select net.http_post(
      url := (select value from public.service_secrets where name = 'app_url')
             || '/api/cron/convenia-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- Cabecalho, nunca query string: URL vaza para log de acesso.
        'X-Cron-Secret', (select value from public.service_secrets where name = 'cron_secret')
      ),
      body := '{}'::jsonb,
      -- A carga tem orcamento de 45s no servidor; 5 minutos de folga larga.
      timeout_milliseconds := 300000
    );
  $job$
);

-- ---------------------------------------------------------------------------
-- Para conferir execucoes:
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'sync-convenia-semanal')
--     order by start_time desc limit 10;
--   select * from integration_sync_log where provider = 'convenia'
--     order by started_at desc limit 10;
-- ---------------------------------------------------------------------------
