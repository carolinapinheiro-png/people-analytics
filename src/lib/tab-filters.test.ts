import test from 'node:test';
import assert from 'node:assert/strict';
import { filtersForTab, unavailableFilters } from './tab-filters';

/**
 * Quais filtros cada aba — e cada SUB-ABA — realmente honra.
 *
 * A barra desabilita o que não se aplica e mostra o motivo, em vez de sumir
 * com o controle: some sem explicação faz parecer que ele nunca existiu, e a
 * pessoa não aprende o limite.
 *
 * Isto não tinha teste, e a revisão de pré-lançamento mostrou por que importa:
 * as três sub-abas de Experiência não estavam declaradas, então herdavam os
 * três filtros da aba. Em Inclusão, os três apareciam ativos e nenhum fazia
 * efeito — o servidor não filtra aquela base por nada.
 */

// ---------------------------------------------------------------------------
// AS SUB-ABAS DE EXPERIÊNCIA
// ---------------------------------------------------------------------------

test('Engajamento aceita os três recortes', () => {
  assert.deepEqual(filtersForTab('engagement', 'engajamento'),
    ['departamento', 'tempoCasa', 'modeloTrabalho']);
});

test('Onboarding aceita só área', () => {
  // A pesquisa é fatiada por área, empresa e mês de entrada. Tempo de casa ali
  // é vazio de sentido: quem está em onboarding tem 0-3 meses por definição.
  assert.deepEqual(filtersForTab('engagement', 'onboarding'), ['departamento']);
});

test('Inclusão não aceita filtro nenhum', () => {
  // `experience_distributions` não tem coluna de recorte, e o servidor não a
  // filtra por nada. O seletor de área aparecia e não fazia efeito — pior que
  // não existir, porque promete.
  assert.deepEqual(filtersForTab('engagement', 'inclusao'), []);
});

test('o que a sub-aba não honra aparece esmaecido COM motivo', () => {
  const inc = unavailableFilters('engagement', 'inclusao');
  assert.deepEqual(inc.map((i) => i.key).sort(),
    ['departamento', 'modeloTrabalho', 'tempoCasa']);
  for (const i of inc) assert.ok(i.reason.length > 20, `${i.key} sem motivo`);
});

test('em Onboarding, área NÃO entra na lista de indisponíveis', () => {
  const chaves = unavailableFilters('engagement', 'onboarding').map((i) => i.key);
  assert.ok(!chaves.includes('departamento'), 'área funciona em Onboarding');
  assert.ok(chaves.includes('tempoCasa'));
  assert.ok(chaves.includes('modeloTrabalho'));
});

test('sem sub-aba, a aba manda e nada é marcado por este caminho', () => {
  assert.deepEqual(filtersForTab('engagement', null),
    ['departamento', 'tempoCasa', 'modeloTrabalho']);
  assert.deepEqual(unavailableFilters('engagement', null), []);
});

// ---------------------------------------------------------------------------
// COMPENSAÇÃO JÁ ESTAVA CERTA
// ---------------------------------------------------------------------------
// Eu relatei que cinco seletores não faziam nada em "Custos & Bandas". Errado:
// `custos` sempre declarou só departamento, e a barra usa a declaração da
// sub-aba. Eu tinha verificado que o componente não consome `filters` e
// concluído dali que a barra os oferecia — meia verificação.
// Estes testes existem para que a próxima dúvida se responda sozinha.

test('Custos & Bandas oferece só área; Comp Ratio oferece as seis', () => {
  assert.deepEqual(filtersForTab('comp', 'custos'), ['departamento']);
  assert.equal(filtersForTab('comp', 'compratio').length, 6);
  assert.deepEqual(filtersForTab('comp', 'movimentacoes'), ['departamento']);
});

test('uma aba sem sub-aba declarada cai na lista da aba', () => {
  assert.deepEqual(filtersForTab('dei', null), ['departamento']);
  assert.deepEqual(filtersForTab('demographics', 'inexistente'), ['departamento']);
});
