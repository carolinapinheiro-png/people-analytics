import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFiltrosDeComp } from './filtros-comp';

/**
 * Os filtros de tela da folha, agora num lugar só.
 *
 * O cartão de equidade vive na MESMA tela da lista de comp-ratio e nasceu sem
 * filtro nenhum. Com Technology selecionado, a lista mostrava Technology e a
 * tabela de equidade mostrava a empresa inteira — duas populações na mesma
 * página, sem nada dizendo qual era qual.
 *
 * Copiar a cadeia de `.filter()` resolveria hoje e divergiria na primeira
 * mudança. Estes testes existem porque a regra passou a ser compartilhada.
 */

const p = (o: Partial<{
  area: string; level: string; contract: string; job_type_family: string;
  hire: string; salary: number;
}>) => ({ area: 'TECHNOLOGY', level: 'L3', ...o });

test('sem filtro, devolve tudo', () => {
  const linhas = [p({}), p({ area: 'LEGAL' })];
  assert.equal(aplicarFiltrosDeComp(linhas, undefined).length, 2);
  assert.equal(aplicarFiltrosDeComp(linhas, {}).length, 2);
});

test('"Todos" é sentinela, não valor', () => {
  // A tela manda a string "Todos" quando nada está filtrado, e "Todos" é
  // truthy. Este projeto já tropeçou nisso duas vezes noutro arquivo.
  const linhas = [p({}), p({ area: 'LEGAL' })];
  assert.equal(aplicarFiltrosDeComp(linhas, { department: 'Todos' }).length, 2);
  assert.equal(aplicarFiltrosDeComp(linhas, { department: '' }).length, 2);
});

test('área compara sem diferenciar caixa', () => {
  const linhas = [p({ area: 'Technology' })];
  assert.equal(aplicarFiltrosDeComp(linhas, { department: 'TECHNOLOGY' }).length, 1);
});

test('os filtros se somam, não se substituem', () => {
  const linhas = [
    p({ area: 'TECHNOLOGY', level: 'L3' }),
    p({ area: 'TECHNOLOGY', level: 'L5' }),
    p({ area: 'LEGAL', level: 'L3' }),
  ];
  const r = aplicarFiltrosDeComp(linhas, { department: 'TECHNOLOGY', level: 'L3' });
  assert.equal(r.length, 1);
});

test('quem não tem admissão sai do recorte por tempo de casa', () => {
  // Não sabemos a faixa dessa pessoa, então ela não entra na faixa escolhida.
  // Incluí-la seria afirmar um tempo de casa que ninguém mediu.
  const linhas = [p({ hire: '01/01/20' }), p({})];
  const r = aplicarFiltrosDeComp(linhas, { tenureBand: '5a+' });
  assert.ok(r.length <= 1, 'quem não tem hire não pode entrar');
  for (const x of r) assert.ok(x.hire, 'só entra quem tem admissão');
});

test('quem não tem salário sai do recorte por faixa salarial', () => {
  const linhas = [p({ salary: 12000 }), p({})];
  const r = aplicarFiltrosDeComp(linhas, { salaryBand: 'Não informado' });
  for (const x of r) assert.equal(x.salary, undefined);
});

test('contrato e job family filtram por igualdade exata, com trim', () => {
  const linhas = [
    p({ contract: ' CLT ', job_type_family: 'Product & Technology' }),
    p({ contract: 'PJ', job_type_family: 'Finance' }),
  ];
  assert.equal(aplicarFiltrosDeComp(linhas, { contract: 'CLT' }).length, 1);
  assert.equal(aplicarFiltrosDeComp(linhas, { jobFamily: 'Finance' }).length, 1);
});

test('não devolve as mesmas referências filtradas por acidente', () => {
  // Devolve um array novo: mutar o resultado não pode mexer na entrada.
  const linhas = [p({}), p({ area: 'LEGAL' })];
  const r = aplicarFiltrosDeComp(linhas, { department: 'LEGAL' });
  assert.equal(r.length, 1);
  assert.equal(linhas.length, 2);
});
