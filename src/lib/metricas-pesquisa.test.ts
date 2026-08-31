import test from 'node:test';
import assert from 'node:assert/strict';
import { METRICAS } from './metricas-pesquisa';

/**
 * Os três painéis de "indicadores ao longo das pesquisas".
 *
 * O balão mostrava sempre o eNPS em corpo grande, em qual painel o mouse
 * estivesse. Apontando para Satisfação, o destaque era um número de outra
 * coluna -- relatado pela Marília como "independente da coluna, o número que
 * mostra é o de eNPS".
 *
 * O destaque agora sai de `METRICAS`, então o que estes testes protegem é o
 * contrato dessa lista: cada indicador tem chave própria, formato próprio e
 * sabe extrair o próprio valor.
 */

const ponto = {
  enps: 78.4, satisfacao: 8.94, risco: 13.75,
  n: 24, promotores: 17, passivos: 5, detratores: 2,
} as never;

test('os três indicadores têm chaves distintas', () => {
  const chaves = METRICAS.map((m) => m.chave);
  assert.deepEqual(chaves, ['enps', 'satisfacao', 'risco']);
  assert.equal(new Set(chaves).size, 3);
});

test('cada um extrai o SEU valor do ponto', () => {
  // O defeito era exatamente este: o balão lia `ponto.enps` fixo em vez de
  // perguntar ao indicador em foco.
  const por = (k: string) => METRICAS.find((m) => m.chave === k)!.valor(ponto);
  assert.equal(por('enps'), 78.4);
  assert.equal(por('satisfacao'), 8.94);
  assert.equal(por('risco'), 13.75);
});

test('cada um formata do seu jeito, e os três jeitos são diferentes', () => {
  const fmt = (k: string) => {
    const m = METRICAS.find((x) => x.chave === k)!;
    return m.formatar(m.valor(ponto)!);
  };
  // eNPS é inteiro -- decimal em eNPS sugere uma precisão que a subtração
  // de percentuais não tem.
  assert.equal(fmt('enps'), '78');
  // Satisfação é de 0 a 10: sem casa decimal, quase toda variação some.
  assert.equal(fmt('satisfacao'), '8,9');
  // Risco é percentual, e o símbolo faz parte do número.
  assert.equal(fmt('risco'), '13,8%');
});

test('só o risco é invertido: subir é ruim', () => {
  const inversos = METRICAS.filter((m) => m.inverso).map((m) => m.chave);
  assert.deepEqual(inversos, ['risco']);
});

test('valor ausente devolve null e não é formatado como zero', () => {
  // "0%" de risco é uma afirmação; ausência não é.
  const vazio = { enps: 0, satisfacao: null, risco: null, n: 0 } as never;
  assert.equal(METRICAS.find((m) => m.chave === 'satisfacao')!.valor(vazio), null);
  assert.equal(METRICAS.find((m) => m.chave === 'risco')!.valor(vazio), null);
});
