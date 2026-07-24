/**
 * Testes do adaptador XLSX com planilha sintetica construida em memoria.
 *
 * Mesmo runner dos testes do nucleo:
 *   npx tsc src/lib/aggregator/*.ts --outDir /tmp/aggtest --module commonjs \
 *     --target es2020 --strict --esModuleInterop --skipLibCheck
 *   node --test /tmp/aggtest/xlsx-adapter.test.js
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { parseTalentMobility } from './xlsx-adapter';

const buildWorkbook = (opts?: {
  peopleHeaders?: string[];
  peopleRows?: unknown[][];
  historyHeaders?: string[];
  historyRows?: unknown[][];
}): Uint8Array => {
  const peopleHeaders = opts?.peopleHeaders ?? [
    'Empresa',
    'CPF',
    'Estado civil',
    'Data de admissão',
    'Data de desligamento',
    'Tipo de desligamento',
    'Gênero',
    'Estado',
    'Liderança',
  ];
  const peopleRows = opts?.peopleRows ?? [
    ['NSX BRASIL RECIFE', '111.222.333-44', 'Solteiro', '10/01/2024', null, null, 'Mulher', 'PE', 'Não'],
    ['EMPRESA NOVA LTDA', '555.666.777-88', 'Casado', '01/03/2025', null, null, 'Homem', 'SP', 'Sim'],
  ];
  const historyHeaders = opts?.historyHeaders ?? [
    'CPF',
    'Data de início',
    'Data de fim',
    'Departamento',
    'Salário',
  ];
  const historyRows = opts?.historyRows ?? [
    ['111.222.333-44', '10/01/2024', null, 'TECH', '10.500,00'],
    ['555.666.777-88', '01/03/2025', null, 'OPERATIONS', '9.800'],
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([peopleHeaders, ...peopleRows]),
    'Worksheet',
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([historyHeaders, ...historyRows]),
    'Histórico cargos e salários',
  );
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Uint8Array;
};

test('detecta as duas abas e mapeia todas as colunas obrigatorias', () => {
  const { report } = parseTalentMobility(buildWorkbook());
  assert.equal(report.peopleSheet, 'Worksheet');
  assert.equal(report.historySheet, 'Histórico cargos e salários');
  assert.deepEqual(report.errors, []);
  for (const m of [...report.peopleMapping, ...report.historyMapping]) {
    if (m.required) assert.ok(m.header, `campo obrigatorio sem coluna: ${m.field}`);
  }
});

test('"Estado civil" nao e confundido com "Estado"; "Tipo de desligamento" nao vira data', () => {
  const { report } = parseTalentMobility(buildWorkbook());
  const state = report.peopleMapping.find((m) => m.field === 'state');
  const term = report.peopleMapping.find((m) => m.field === 'termination');
  assert.equal(state?.header, 'Estado');
  assert.equal(term?.header, 'Data de desligamento');
});

test('CPF normalizado para digitos; datas dd/mm/aaaa; salario brasileiro', () => {
  const { people, history } = parseTalentMobility(buildWorkbook());
  const p = people.find((x) => x.cpf === '11122233344');
  assert.ok(p, 'pessoa com CPF normalizado');
  assert.equal(p?.admission?.toISOString().slice(0, 10), '2024-01-10');
  const h = history.find((x) => x.cpf === '11122233344');
  assert.equal(h?.salary, 10500);
});

test('empresa fora do COMPANY_TO_BU e acusada no relatorio', () => {
  const { report } = parseTalentMobility(buildWorkbook());
  assert.equal(report.unmappedCompanies.length, 1);
  assert.equal(report.unmappedCompanies[0].company, 'EMPRESA NOVA LTDA');
});

test('salario milhar sem centavos ("9.800") e acusado como suspeito', () => {
  const { report } = parseTalentMobility(buildWorkbook());
  assert.equal(report.suspiciousSalaries, 1);
});

test('coluna obrigatoria ausente vira erro bloqueante, nao silencio', () => {
  const { report, people } = parseTalentMobility(
    buildWorkbook({
      peopleHeaders: ['Empresa', 'CPF', 'Data de admissão', 'Gênero', 'Estado', 'Liderança'],
      peopleRows: [['NSX BRASIL RECIFE', '111', '10/01/2024', 'Mulher', 'PE', 'Não']],
    }),
  );
  assert.ok(report.errors.some((e) => e.includes('termination')));
  assert.equal(people.length, 0);
});

test('linha sem CPF e pulada e contada', () => {
  const { report } = parseTalentMobility(
    buildWorkbook({
      peopleRows: [
        ['NSX BRASIL RECIFE', '', 'Solteiro', '10/01/2024', null, null, 'Mulher', 'PE', 'Não'],
        ['NSX BRASIL RECIFE', '222', 'Solteiro', '10/01/2024', null, null, 'Homem', 'SP', 'Não'],
      ],
    }),
  );
  assert.equal(report.skippedPeople, 1);
  assert.equal(report.peopleRows, 1);
});

test('admissao futura e contada (caso das admissoes ago/set 2026)', () => {
  const { report } = parseTalentMobility(
    buildWorkbook({
      peopleRows: [
        ['NSX BRASIL RECIFE', '333', 'Solteiro', '01/08/2099', null, null, 'Mulher', 'PE', 'Não'],
      ],
    }),
  );
  assert.equal(report.futureAdmissions, 1);
});

test('multiplos vinculos do mesmo CPF sao contados no relatorio', () => {
  const { report } = parseTalentMobility(
    buildWorkbook({
      peopleRows: [
        ['NSX BRASIL RECIFE', '444', 'Solteiro', '01/06/2023', '01/05/2024', null, 'Homem', 'PE', 'Não'],
        ['NSX BRASIL RECIFE', '444', 'Solteiro', '01/07/2025', null, null, 'Homem', 'PE', 'Não'],
      ],
    }),
  );
  assert.equal(report.multiLinkCpfs, 1);
});
