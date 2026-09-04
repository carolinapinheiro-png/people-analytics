import test from 'node:test';
import assert from 'node:assert/strict';
import { montarLinhas, COLUNAS, dataBR, rotuloDoMes, semEmpresa, fimDoMes, admitidoAte, type PessoaDoMes } from './controladoria';

const base: PessoaDoMes = {
  nome: 'Fulana de Tal', status: 'ativo', department: 'TECHNOLOGY',
  cost_center: 'AI TECH (12473001)', hiring_date: '2025-07-01',
  empresa: 'NSX Brasil Recife', escritorio: 'Recife - Boa Viagem',
  gestor: 'Beltrano', personalizados: [
    { nome: 'Job Type Family', valor: 'Product & Technology' },
    { nome: 'WorkDay Level', valor: 'N-5' },
    { nome: 'Career Band', valor: 'D - Manager + Specialist roles' },
    { nome: 'Role', valor: 'TECHNICAL ROLE' },
    { nome: 'Modelo de Jornada de Trabalho', valor: 'Presencial' },
    { nome: 'Type of contract Flutter', valor: 'CLT' },
  ],
};

test('as 17 colunas saem na ordem da planilha', () => {
  assert.equal(COLUNAS.length, 17);
  assert.equal(COLUNAS[14], 'Company', 'Company é a 15ª — semEmpresa depende disso');
  const [l] = montarLinhas([base], 'ago./2026');
  assert.equal(l.length, 17);
  assert.deepEqual(
    [l[0], l[1], l[5], l[9], l[14], l[16]],
    ['ago./2026', 'Fulana de Tal', 'TECHNOLOGY', 'AI TECH (12473001)', 'NSX Brasil Recife', 'Recife - Boa Viagem'],
  );
});

test('o rótulo do mês bate caractere a caractere com os que já existem', () => {
  // A aba de cada mês filtra por igualdade. "Ago/2026" criaria um mês novo e o
  // pivô do mês certo viria vazio, sem erro nenhum.
  assert.equal(rotuloDoMes(2026, 8), 'ago./2026');
  assert.equal(rotuloDoMes(2026, 7), 'jul./2026');
  assert.equal(rotuloDoMes(2025, 10), 'out./2025');
});

test('a data vira dd/mm/aaaa, e o que já está no formato não é estragado', () => {
  assert.equal(dataBR('2025-07-01'), '01/07/2025');
  assert.equal(dataBR('01/07/2025'), '01/07/2025');
  assert.equal(dataBR(null), '');
  assert.equal(dataBR('mês que vem'), '');
});

test('campo personalizado casa por nome EXATO, não por pedaço', () => {
  // "Level" por pedaço pegaria "WorkDay Level" e devolveria o que viesse
  // primeiro na lista -- e a ordem de custom_fields não é contrato.
  const p: PessoaDoMes = { ...base, personalizados: [
    { nome: 'WorkDay Level', valor: 'N-6 Above' },
    { nome: 'Level', valor: 'L3' },
  ] };
  const [l] = montarLinhas([p], 'ago./2026');
  assert.equal(l[7], 'N-6 Above', 'Work Day Level');
});

test('acento e caixa não separam o mesmo campo', () => {
  const p: PessoaDoMes = { ...base, personalizados: [{ nome: 'MODELO DE JORNADA DE TRABALHO', valor: 'Híbrido' }] };
  assert.equal(montarLinhas([p], 'ago./2026')[0][15], 'Híbrido');
});

test('campo ausente vira vazio, e não "undefined" na planilha', () => {
  const p: PessoaDoMes = { ...base, personalizados: [] };
  const [l] = montarLinhas([p], 'ago./2026');
  assert.equal(l[3], '');
  assert.ok(!l.includes('undefined'), 'nada de "undefined" indo para a Controladoria');
});

test('Company vazia fica VAZIA, e é contada', () => {
  // Inventar aqui põe a pessoa inteira na empresa errada, num report que é
  // cortado por empresa. Vazio é visível; errado não é.
  const linhas = montarLinhas([base, { ...base, empresa: null }], 'ago./2026');
  assert.equal(linhas[1][14], '');
  assert.equal(semEmpresa(linhas), 1);
});

test('fimDoMes acha o ultimo dia, inclusive em fevereiro bissexto', () => {
  assert.equal(fimDoMes(2026, 2), '2026-02-28');
  assert.equal(fimDoMes(2024, 2), '2024-02-29');
  assert.equal(fimDoMes(2026, 8), '2026-08-31');
  assert.equal(fimDoMes(2026, 12), '2026-12-31');
});

test('admitidoAte corta quem entrou depois do fim do mes', () => {
  // O caso real: rodando em 4 de setembro, a base de agosto nao pode conter
  // quem foi admitido em 2 de setembro. Antes o mes era so carimbo.
  assert.equal(admitidoAte('2026-09-02', '2026-08-31'), false);
  assert.equal(admitidoAte('2026-08-31', '2026-08-31'), true);
  assert.equal(admitidoAte('2025-01-15', '2026-08-31'), true);
});

test('sem data de admissao a pessoa fica, e nao some', () => {
  // Tirar uma pessoa real por falta de um campo e pior do que deixa-la: a
  // linha fica visivel e alguem confere.
  assert.equal(admitidoAte(null, '2026-08-31'), true);
  assert.equal(admitidoAte('', '2026-08-31'), true);
  assert.equal(admitidoAte('data estranha', '2026-08-31'), true);
});
