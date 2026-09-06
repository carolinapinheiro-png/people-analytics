import test from 'node:test';
import assert from 'node:assert/strict';
import {
  familiaWIL, janela12, montarLocation, semFamilia, FAMILIAS_WIL, type PessoaWIL,
} from './wil-location';

const p = (o: Partial<PessoaWIL>): PessoaWIL => ({
  familia: 'Finance', tipo: 'CLT', genero: null, fte: null,
  admissao: '2020-01-10', saida: null, voluntaria: null, ...o,
});

test('o de-para traduz os dois nomes por extenso do cadastro', () => {
  assert.equal(
    familiaWIL('Leadership (Executive) SR and C-Levels (reporting to CEO or N-3)'),
    'Leadership (Executive)',
  );
  assert.equal(familiaWIL('Other (Property, Security, Cleaning)'), 'Other');
  assert.equal(familiaWIL('Customer Operations'), 'Customer Operations');
});

test('familia desconhecida devolve null, e nao cai em "Other"', () => {
  // "Other" e uma familia de verdade, com quinze pessoas no arquivo entregue.
  // Usa-la de lixeira misturaria gente real com gente sem classificacao.
  assert.equal(familiaWIL('Growth Hacking'), null);
  assert.equal(familiaWIL(''), null);
  assert.equal(familiaWIL(null), null);
});

test('janela12 termina no mes de referencia e tem doze meses', () => {
  const j = janela12('2026-08');
  assert.equal(j.length, 12);
  assert.equal(j[0], '2025-09');
  assert.equal(j[11], '2026-08');
});

test('janela12 atravessa a virada de ano', () => {
  const j = janela12('2026-02');
  assert.equal(j[0], '2025-03');
  assert.equal(j[11], '2026-02');
});

test('sempre devolve as vinte linhas, mesmo com familia zerada', () => {
  const linhas = montarLocation([], '2026-08');
  assert.equal(linhas.length, FAMILIAS_WIL.length * 2);
  assert.equal(linhas.filter((l) => l.tipo === 'Contractor').length, 10);
  assert.ok(linhas.every((l) => l.headcount === 0));
});

test('CLT vai para Regular e PJ para Contractor', () => {
  const linhas = montarLocation(
    [p({ tipo: 'CLT' }), p({ tipo: 'PJ' }), p({ tipo: 'PJ' })], '2026-08',
  );
  const fin = (t: string) => linhas.find((l) => l.familia === 'Finance' && l.tipo === t)!;
  assert.equal(fin('Regular').headcount, 1);
  assert.equal(fin('Contractor').headcount, 2);
});

test('quem saiu antes do mes nao conta no headcount, e conta nos 12 meses', () => {
  const linhas = montarLocation([p({ saida: '2026-03', genero: 'F', voluntaria: true })], '2026-08');
  const fin = linhas.find((l) => l.familia === 'Finance' && l.tipo === 'Regular')!;
  assert.equal(fin.headcount, 0);
  assert.equal(fin.saidas12m, 1);
  assert.equal(fin.saidasMulheres12m, 1);
  assert.equal(fin.saidasVoluntarias12m, 1);
  assert.equal(fin.saidasVoluntariasMulheres12m, 1);
});

test('saida fora da janela de doze meses nao conta', () => {
  const linhas = montarLocation([p({ saida: '2024-01' })], '2026-08');
  assert.equal(linhas.find((l) => l.familia === 'Finance')!.saidas12m, 0);
});

test('quem saiu NO mes de referencia ainda esta dentro', () => {
  const linhas = montarLocation([p({ saida: '2026-08' })], '2026-08');
  const fin = linhas.find((l) => l.familia === 'Finance')!;
  assert.equal(fin.headcount, 1);
  assert.equal(fin.saidasNoMes, 1);
});

test('admissao futura nao entra em mes nenhum', () => {
  const linhas = montarLocation([p({ admissao: '2026-09-02' })], '2026-08');
  assert.equal(linhas.find((l) => l.familia === 'Finance')!.headcount, 0);
});

test('FTE ausente conta como integral, e nao como zero', () => {
  // O template diz que jornada integral pode ficar em branco: ausencia do
  // campo significa 1, senao 64 pessoas sem o campo derrubariam o total.
  const linhas = montarLocation([p({ fte: null }), p({ fte: 0.9 })], '2026-08');
  assert.equal(linhas.find((l) => l.familia === 'Finance')!.fte, 1.9);
});

test('voluntaria nula nao conta como voluntaria nem como involuntaria', () => {
  const linhas = montarLocation([p({ saida: '2026-03', voluntaria: null })], '2026-08');
  const fin = linhas.find((l) => l.familia === 'Finance')!;
  assert.equal(fin.saidas12m, 1);
  assert.equal(fin.saidasVoluntarias12m, 0);
});

test('media de doze meses conta cada mes, e nao so o ultimo', () => {
  const linhas = montarLocation([p({ admissao: '2026-03-01' })], '2026-08');
  assert.equal(linhas.find((l) => l.familia === 'Finance')!.mediaHeadcount12m, 1);
  const vazio = montarLocation([p({ admissao: '2026-08-01' })], '2026-08');
  assert.equal(vazio.find((l) => l.familia === 'Finance')!.mediaHeadcount12m, 0);
});

test('sem familia fica de fora das linhas e e contado a parte', () => {
  const pessoas = [p({ familia: null }), p({ familia: null }), p({})];
  const linhas = montarLocation(pessoas, '2026-08');
  assert.equal(linhas.reduce((s, l) => s + l.headcount, 0), 1);
  assert.equal(semFamilia(pessoas), 2);
});
