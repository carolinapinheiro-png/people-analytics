import test from 'node:test';
import assert from 'node:assert/strict';
import { lerPromessas, lerTodas, pendencias } from './migracoes';

// ------------------------------------------------------------- o que reconhece

test('reconhece a coluna que faltava de verdade', () => {
  // Este é o arquivo que existia no repositório desde 14/08 e nunca foi
  // aplicado. A aba de Salários ficou quebrada para todo mundo por dias.
  const sql = `
    -- Camada N (o "WorkDay Level") na base de remuneração.
    alter table public.comp_ratio
      add column if not exists n_layer text;
    create index if not exists comp_ratio_n_layer_idx on public.comp_ratio (n_layer);
  `;
  const p = lerPromessas('20260814180000_comp_ratio_n_layer.sql', sql);
  assert.deepEqual(
    p.map((x) => `${x.tipo}|${x.nome}`).sort(),
    ['coluna|comp_ratio.n_layer', 'indice|comp_ratio_n_layer_idx'],
  );
});

test('reconhece tabela, enum e função', () => {
  const p = lerPromessas('x.sql', `
    create table if not exists public.org_pessoas (id uuid primary key);
    alter type public.access_profile add value if not exists 'engagement_viewer';
    create or replace function public.validate_allowed_email_rules() returns trigger as $$ $$;
  `);
  assert.deepEqual(p.map((x) => `${x.tipo}|${x.nome}`).sort(), [
    'enum|access_profile.engagement_viewer',
    'funcao|validate_allowed_email_rules',
    'tabela|org_pessoas',
  ]);
});

test('comentário não vira promessa', () => {
  // O comentário desta migration real fala de `alter table` e de colunas
  // dentro de uma explicação. Se o texto contasse, o verificador acusaria
  // objetos que ninguém prometeu -- e um alerta com falso positivo é ignorado
  // junto com os verdadeiros.
  const p = lerPromessas('x.sql', `
    -- Aqui eu poderia ter feito: create table public.inventada (...)
    /* e também alter table public.outra add column fantasma text; */
    create table public.real (id int);
  `);
  assert.deepEqual(p.map((x) => x.nome), ['real']);
});

test('aspas e schema não mudam o nome', () => {
  const p = lerPromessas('x.sql', 'create table if not exists "public"."minha_tabela" (id int);');
  assert.equal(p[0]?.nome, 'minha_tabela');
});

// ------------------------------------------- deliberadamente não reconhece

test('o que não reconhece não vira promessa -- e isso é o modo de falha seguro', () => {
  // Policy, trigger e view passam batido de propósito. O pior caso é não
  // avisar; nunca avisar errado. Um verificador que acusa o que está certo é
  // desligado na primeira semana.
  const p = lerPromessas('x.sql', `
    create policy "leitura" on public.t for select using (true);
    create trigger t_bi before insert on public.t execute function f();
    create view public.v as select 1;
  `);
  assert.deepEqual(p, []);
});

// ------------------------------------------------------------ juntando tudo

test('objeto declarado duas vezes fica com o arquivo mais antigo', () => {
  // É onde a pessoa precisa procurar quando ele não está lá.
  const todas = lerTodas([
    { arquivo: '20260814_depois.sql', sql: 'create table if not exists public.t (id int);' },
    { arquivo: '20260801_antes.sql', sql: 'create table if not exists public.t (id int);' },
  ]);
  assert.equal(todas.length, 1);
  assert.equal(todas[0].arquivo, '20260801_antes.sql');
});

// ------------------------------------------------------------- a conferência

test('aponta só o que não existe', () => {
  const promessas = lerTodas([{
    arquivo: 'm.sql',
    sql: `alter table public.comp_ratio add column if not exists n_layer text;
          create table if not exists public.org_pessoas (id int);`,
  }]);
  const existe = new Set(['tabela|org_pessoas']);
  const faltam = pendencias(promessas, existe);
  assert.equal(faltam.length, 1);
  assert.equal(faltam[0].nome, 'comp_ratio.n_layer');
  assert.match(faltam[0].descricao, /coluna comp_ratio\.n_layer/);
  assert.match(faltam[0].descricao, /m\.sql/, 'diz onde olhar');
});

test('banco em dia não produz aviso nenhum', () => {
  const promessas = lerTodas([{ arquivo: 'm.sql', sql: 'create table public.t (id int);' }]);
  assert.deepEqual(pendencias(promessas, new Set(['tabela|t'])), []);
});
