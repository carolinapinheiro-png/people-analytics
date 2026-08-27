import test from 'node:test';
import assert from 'node:assert/strict';
import { aplicarFiltro } from '@/lib/aplicar-filtro';
import type { Filters } from '@/data/DashboardContext';

const VAZIO: Filters = {
  jobFamily: 'Todos', departamento: 'Todos', tempoCasa: 'Todos', centroCusto: 'Todos',
  tipoContrato: 'Todos', faixaSalarial: 'Todos', tipoDesligamento: 'Todos', level: 'Todos',
  modeloTrabalho: 'Todos',
};

test('departamento NÃO limpa tempo de casa nem modelo', () => {
  // Foi assim que chegou o relato: "seleciono departamento e o modelo volta
  // para todos". Se este teste falhar um dia, é esse o sintoma.
  const antes = { ...VAZIO, tempoCasa: '24+ meses', modeloTrabalho: 'Híbrido' };
  const r = aplicarFiltro(antes, 'departamento', 'MARKETING', 'engagement');
  assert.equal(r.filtros.departamento, 'MARKETING');
  assert.equal(r.filtros.tempoCasa, '24+ meses');
  assert.equal(r.filtros.modeloTrabalho, 'Híbrido');
  assert.deepEqual(r.limpos, []);
});

test('área soma com perfil: os dois ficam de pé', () => {
  let f = aplicarFiltro(VAZIO, 'departamento', 'MARKETING', 'engagement').filtros;
  const r = aplicarFiltro(f, 'tempoCasa', '24+ meses', 'engagement');
  assert.equal(r.filtros.departamento, 'MARKETING');
  assert.equal(r.filtros.tempoCasa, '24+ meses');
});

test('tempo de casa e modelo SOMAM: nenhum apaga o outro', () => {
  // Este teste afirmava o contrário, e estava certo para o banco de então:
  // 'tempo+modelo' não era gravado, e a barra apagava um para não prometer um
  // cruzamento inexistente.
  //
  // Passou a ser gravado, e medido em ago/26 é o cruzamento com melhor
  // aproveitamento do painel -- 20 de 20 combinações acima do mínimo. A
  // exclusão virou a única coisa impedindo o melhor recorte disponível.
  const antes = { ...VAZIO, modeloTrabalho: 'Híbrido' };
  const r = aplicarFiltro(antes, 'tempoCasa', '24+ meses', 'engagement');
  assert.equal(r.filtros.tempoCasa, '24+ meses');
  assert.equal(r.filtros.modeloTrabalho, 'Híbrido');
  assert.deepEqual(r.limpos, []);
});

test('os três juntos convivem: área não apaga perfil nenhum', () => {
  const antes = { ...VAZIO, modeloTrabalho: 'Remoto', tempoCasa: '24+ meses' };
  const r = aplicarFiltro(antes, 'departamento', 'TECHNOLOGY', 'engagement');
  assert.equal(r.filtros.departamento, 'TECHNOLOGY');
  assert.equal(r.filtros.tempoCasa, '24+ meses');
  assert.equal(r.filtros.modeloTrabalho, 'Remoto');
  assert.deepEqual(r.limpos, []);
});

test('nível e tempo de casa continuam se excluindo na série mensal', () => {
  // A outra regra NÃO caiu junto: a série mensal segue sem o cruzamento
  // pré-calculado entre nível e tempo de casa.
  const antes = { ...VAZIO, level: 'L4' };
  const r = aplicarFiltro(antes, 'tempoCasa', '1-2 anos', 'attrition');
  assert.equal(r.filtros.level, 'Todos');
  assert.deepEqual(r.limpos, ['level']);
});

test('desligar um filtro não mexe em nenhum outro', () => {
  const antes = { ...VAZIO, departamento: 'MARKETING', tempoCasa: '24+ meses' };
  const r = aplicarFiltro(antes, 'tempoCasa', 'Todos', 'engagement');
  assert.equal(r.filtros.departamento, 'MARKETING');
  assert.deepEqual(r.limpos, []);
});

test('level e tempo de casa continuam se excluindo em toda aba', () => {
  const antes = { ...VAZIO, level: 'L4' };
  const r = aplicarFiltro(antes, 'tempoCasa', '1-2 anos', 'overview');
  assert.equal(r.filtros.level, 'Todos');
  assert.deepEqual(r.limpos, ['level']);
});
