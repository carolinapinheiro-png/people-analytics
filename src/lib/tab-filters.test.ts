import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filtersForTab, unavailableFilters, FILTERS_BY_TAB,
  ABAS_QUE_APLICAM_RECORTE, ABAS_PESSOA_A_PESSOA, ABAS_FILTRADAS_NO_SERVIDOR,
  RECORTES_EXCLUSIVOS, RECORTES_DE_ATRICAO,
  type FilterKey,
} from './tab-filters';
import type { DashboardTab } from './permissions';

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

test('só departamento é oferecido, em toda aba e sub-aba', () => {
  // 10/09: os recortes de dimensão foram desligados a pedido da Carolina.
  // Ver a nota em FILTROS_FIXOS. Este teste é o contrato dessa decisão: se
  // alguém religar um filtro sem passar pela verificação de dado, ele quebra.
  const abas = ['overview', 'dei', 'demographics', 'span', 'recruitment',
    'engagement', 'attrition', 'comp', 'team', 'data'] as const;
  for (const aba of abas) {
    assert.deepEqual(filtersForTab(aba, null), ['departamento'], `${aba}`);
  }
  for (const sub of ['custos', 'compratio', 'movimentacoes', 'engajamento', 'onboarding']) {
    assert.deepEqual(filtersForTab('comp', sub), ['departamento'], sub);
  }
});

test('Inclusão continua sem filtro nenhum, por um motivo PRÓPRIO', () => {
  // `experience_distributions` não tem coluna de recorte -- nem por área. Esta
  // ausência é anterior ao desligamento geral e sobrevive a ele: se os filtros
  // voltarem, esta sub-aba continua sem, e o motivo continua sendo o dado.
  assert.deepEqual(filtersForTab('engagement', 'inclusao'), []);
  const inc = unavailableFilters('engagement', 'inclusao');
  assert.deepEqual(inc.map((i) => i.key), ['departamento']);
  assert.ok(inc[0].reason.length > 20);
});

test('Perfil individual continua sem barra', () => {
  assert.deepEqual(filtersForTab('individual', null), []);
});

test('nada acende sem alguém do outro lado para aplicar', () => {
  // A invariante que sobreviveu ao desligamento: toda aba que OFERECE um
  // recorte de dimensão tem de estar numa das listas de quem APLICA. Com os
  // filtros desligados ela passa vazia -- e volta a cobrar no instante em que
  // alguém acrescentar `jobFamily` a uma aba.
  const aplica = new Set<string>([
    ...ABAS_QUE_APLICAM_RECORTE,
    ...ABAS_PESSOA_A_PESSOA,
    ...ABAS_FILTRADAS_NO_SERVIDOR,
  ]);
  for (const [aba, fs] of Object.entries(FILTERS_BY_TAB) as Array<[DashboardTab, FilterKey[]]>) {
    if (!fs.some((f) => RECORTES_EXCLUSIVOS.includes(f))) continue;
    assert.ok(aplica.has(aba),
      `A aba "${aba}" voltou a oferecer um recorte de dimensão e ninguém o aplica. `
      + 'Ou o componente chama useRecorteDeSerie() e a aba entra na lista, ou o filtro sai '
      + 'de FILTERS_BY_TAB. Seletor que acende e não filtra foi o que derrubou os filtros '
      + 'em 10/09.');
  }
});

test('o conhecimento sobre Atrição não foi apagado junto', () => {
  // `RECORTES_DE_ATRICAO` guarda o que aquela aba SABE recortar. Cada chave
  // dela custou uma verificação (modeloTrabalho foi tirado em 09/09 por não
  // passar). Fica fora de uso, não fora do código.
  assert.ok(RECORTES_DE_ATRICAO.includes('tipoDesligamento'));
  assert.ok(!RECORTES_DE_ATRICAO.includes('modeloTrabalho'),
    'modelo de trabalho não existe em LeaverRecord -- não pode voltar por engano');
});
