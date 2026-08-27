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

test('tempo de casa e modelo se excluem, e o resultado diz quem saiu', () => {
  // Não existe 'tempo+modelo' gravado: o cruzamento é sempre com área.
  const antes = { ...VAZIO, modeloTrabalho: 'Híbrido' };
  const r = aplicarFiltro(antes, 'tempoCasa', '24+ meses', 'engagement');
  assert.equal(r.filtros.tempoCasa, '24+ meses');
  assert.equal(r.filtros.modeloTrabalho, 'Todos');
  assert.deepEqual(r.limpos, ['modeloTrabalho']);
});

test('a exclusão entre perfis vale SÓ em Engajamento', () => {
  const antes = { ...VAZIO, modeloTrabalho: 'Híbrido' };
  const r = aplicarFiltro(antes, 'tempoCasa', '1-2 anos', 'attrition');
  assert.equal(r.filtros.modeloTrabalho, 'Híbrido');
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
