/**
 * Testes da agregação de vagas do InHire.
 *
 *   npx tsc src/lib/inhire/jobs.ts src/lib/inhire/jobs.test.ts --outDir /tmp/ihtest \
 *     --module commonjs --target es2020 --strict --esModuleInterop --skipLibCheck \
 *     --moduleResolution node
 *   node --test /tmp/ihtest/jobs.test.js
 *
 * Cada teste aqui corresponde a uma armadilha real encontrada na validação da
 * base em 04/08/2026. Todas elas falham em SILÊNCIO: o painel continua
 * desenhando um gráfico bonito com o número errado, e ninguém percebe até
 * alguém conferir na mão.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateJobs, canonDept, deptOf, isTalentPool, statusBucket, tempoDeFechamento,
  type InhireJob,
} from './jobs';

const job = (o: Partial<InhireJob> = {}): InhireJob => ({
  id: Math.random().toString(36).slice(2),
  name: 'Analista',
  status: 'closed',
  createdAt: '2026-01-01T00:00:00Z',
  openPositions: 1,
  applications: 10,
  customFields_map: { Departamento: 'Tecnologia' },
  statusHistory: [
    { status: 'open', createdAt: '2026-01-01T00:00:00Z' },
    { status: 'closed', createdAt: '2026-01-31T00:00:00Z' },
  ],
  ...o,
});

// ------------------------------------------------------- de-para de área

test('departamento: PT e EN caem no mesmo canônico', () => {
  assert.equal(canonDept('Tecnologia'), 'TECHNOLOGY');
  assert.equal(canonDept('Technology'), 'TECHNOLOGY');
  assert.equal(canonDept('RH'), 'HR');
  assert.equal(canonDept('Legal & Compliance'), 'LEGAL & COMPLIANCE');
});

test('departamento: "Operation" e "Operations" convivem na base e são a mesma área', () => {
  assert.equal(canonDept('Operation'), 'OPERATION');
  assert.equal(canonDept('Operations'), 'OPERATION');
  assert.equal(canonDept('Customer Ops'), 'OPERATION');
});

test('departamento: Betfair é marca, não área', () => {
  assert.equal(canonDept('Betfair'), null);
});

test('departamento: valores de talent pool não são área', () => {
  assert.equal(canonDept('N/A - Talent Pool'), null);
  assert.equal(canonDept('N/A - Talent Pool ou Template'), null);
});

test('departamento novo não some: volta em caixa alta', () => {
  // Sumir esconderia junto a informação de que existe uma área nova.
  assert.equal(canonDept('Dados'), 'DADOS');
});

// ------------------------------------------------------------ talent pool

test('talent pool: a flag sozinha NÃO basta', () => {
  // A vaga que sozinha responde por 86% das posições tem isTalentPool = false.
  const contaminadora = job({
    name: 'Talent Pool - Agente de Suporte ao Cliente Bilíngue',
    isTalentPool: false,
    openPositions: 299,
    customFields_map: { Departamento: 'N/A - Talent Pool' },
  });
  assert.equal(contaminadora.isTalentPool, false);
  assert.equal(isTalentPool(contaminadora), true, 'precisa ser pega pelo nome/departamento');
});

test('talent pool: pega pelos três sinais, independentemente', () => {
  assert.equal(isTalentPool(job({ isTalentPool: true, name: 'Analista' })), true);
  assert.equal(isTalentPool(job({ customFields_map: { Departamento: 'N/A - Talent Pool' } })), true);
  assert.equal(isTalentPool(job({ name: 'Talent Pool - Suporte' })), true);
  assert.equal(isTalentPool(job()), false);
});

test('talent pool fica fora das posições abertas', () => {
  const r = aggregateJobs([
    job({ status: 'open', openPositions: 299, name: 'Talent Pool - Suporte' }),
    job({ status: 'open', openPositions: 3 }),
  ], '2026-08-10');
  const total = r.open.reduce((s, o) => s + o.positions, 0);
  assert.equal(total, 3, 'a vaga de talent pool inflaria isto para 302');
  assert.equal(r.resumo.talentPoolExcluidas, 1);
});

// ------------------------------------------------------------ tempo (TTH)

test('tempo de fechamento sai do histórico, já que o sla vem vazio', () => {
  const { dias, fechadaEm } = tempoDeFechamento(job({ sla: null }));
  assert.equal(dias, 30);
  assert.equal(fechadaEm, '2026-01-31');
});

test('período congelado é descontado do tempo', () => {
  // Abre 01/01, congela 11/01, volta 21/01, fecha 31/01.
  // São 30 dias corridos, 10 deles congelados -> 20 dias de recrutamento.
  const { dias } = tempoDeFechamento(job({
    statusHistory: [
      { status: 'open', createdAt: '2026-01-01T00:00:00Z' },
      { status: 'frozen', createdAt: '2026-01-11T00:00:00Z' },
      { status: 'open', createdAt: '2026-01-21T00:00:00Z' },
      { status: 'closed', createdAt: '2026-01-31T00:00:00Z' },
    ],
  }));
  assert.equal(dias, 20, 'sem o desconto daria 30 e o nosso TTH ficaria maior que o do InHire');
});

test('vaga sem fechamento no histórico não vira tempo zero', () => {
  const { dias, fechadaEm } = tempoDeFechamento(job({
    status: 'open',
    statusHistory: [{ status: 'open', createdAt: '2026-01-01T00:00:00Z' }],
  }));
  assert.equal(dias, null);
  assert.equal(fechadaEm, null);
});

test('histórico vazio devolve null, não quebra', () => {
  assert.deepEqual(tempoDeFechamento(job({ statusHistory: [] })), { dias: null, fechadaEm: null });
  assert.deepEqual(tempoDeFechamento(job({ statusHistory: null })), { dias: null, fechadaEm: null });
});

// ------------------------------------------------------------- agregação

test('mês da linha é o do FECHAMENTO, não o da abertura', () => {
  const r = aggregateJobs([job({
    createdAt: '2025-11-01T00:00:00Z',
    statusHistory: [
      { status: 'open', createdAt: '2025-11-01T00:00:00Z' },
      { status: 'closed', createdAt: '2026-02-10T00:00:00Z' },
    ],
  })], '2026-08-10');
  assert.equal(r.monthly.length, 1);
  assert.equal(r.monthly[0].month, '2026-02-01');
});

test('média e mediana de tempo convivem na mesma linha', () => {
  // Os três fechamentos precisam cair no MESMO mês para virarem uma linha só --
  // por isso 1, 3 e 26 dias, e não 10/20/90: uma vaga de 90 dias aberta em
  // março fecha em maio e vai para outra linha, corretamente.
  const mk = (dias: number) => job({
    statusHistory: [
      { status: 'open', createdAt: '2026-03-01T00:00:00Z' },
      { status: 'closed', createdAt: new Date(Date.UTC(2026, 2, 1 + dias)).toISOString() },
    ],
    createdAt: '2026-03-01T00:00:00Z',
  });
  const r = aggregateJobs([mk(1), mk(3), mk(26)], '2026-08-10');
  const l = r.monthly[0];
  assert.equal(l.closed_jobs, 3);
  assert.equal(l.tth_median, 3, 'mediana resiste ao caso de 26 dias');
  assert.equal(l.tth_avg, 10, 'média não resiste -- por isso as duas aparecem');
});

test('fechamentos de meses diferentes viram linhas diferentes', () => {
  const mk = (fecha: string) => job({
    createdAt: '2026-03-01T00:00:00Z',
    statusHistory: [
      { status: 'open', createdAt: '2026-03-01T00:00:00Z' },
      { status: 'closed', createdAt: fecha },
    ],
  });
  const r = aggregateJobs([mk('2026-03-15T00:00:00Z'), mk('2026-05-30T00:00:00Z')], '2026-08-10');
  assert.deepEqual(r.monthly.map((m) => m.month), ['2026-03-01', '2026-05-01']);
});

test('vaga sem departamento vira SEM DEPTO e é contada no resumo', () => {
  const r = aggregateJobs([job({ customFields_map: {} })], '2026-08-10');
  assert.equal(r.monthly[0].department, 'SEM DEPTO');
  assert.equal(r.resumo.semDepartamento, 1);
});

test('abertas e congeladas entram na foto; canceladas não', () => {
  const r = aggregateJobs([
    job({ status: 'open' }), job({ status: 'frozen' }), job({ status: 'canceled' }),
  ], '2026-08-10');
  const status = r.open.map((o) => o.status).sort();
  assert.deepEqual(status, ['aberta', 'congelada']);
});

test('a foto carrega a data: sem ela não existe série de abertas', () => {
  const r = aggregateJobs([job({ status: 'open' })], '2026-08-10');
  assert.equal(r.open[0].as_of, '2026-08-10');
});

test('status desconhecido não vira aberta nem fechada', () => {
  assert.equal(statusBucket('rascunho'), 'outro');
  const r = aggregateJobs([job({ status: 'rascunho' })], '2026-08-10');
  assert.equal(r.monthly.length, 0);
  assert.equal(r.open.length, 0);
});

test('candidaturas somam por área e mês', () => {
  const r = aggregateJobs([
    job({ applications: 100 }), job({ applications: 50 }),
  ], '2026-08-10');
  assert.equal(r.monthly[0].applications, 150);
});

test('nenhum campo de candidato aparece no resultado', () => {
  // A credencial tem acesso total; a agregação é o que garante que nada
  // pessoal saia daqui. Se alguém acrescentar um campo por engano, isto quebra.
  const r = aggregateJobs([job()], '2026-08-10');
  const texto = JSON.stringify(r);
  for (const proibido of ['cpf', 'email', 'phone', 'telefone', 'resume', 'curriculo', 'candidate']) {
    assert.equal(texto.toLowerCase().includes(proibido), false, `vazou "${proibido}"`);
  }
});

test('deptOf lê o custom field, que é onde o dado realmente está', () => {
  // O campo `area` da view vem vazio em 156 de 156 vagas.
  assert.equal(deptOf(job({ customFields_map: { Departamento: 'RH' } })), 'HR');
  assert.equal(deptOf(job({ customFields_map: {} })), null);
});
