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

test('Engajamento aceita os quatro recortes', () => {
  // Marca de produto entrou depois: o cruzamento 'area+marca' já era gravado
  // em toda onda e a barra não oferecia. Ver recorte-ativo.ts.
  assert.deepEqual(filtersForTab('engagement', 'engajamento'),
    ['departamento', 'tempoCasa', 'modeloTrabalho', 'marcaProduto']);
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
  // `jobFamily` e `tipoContrato` entram por serem FIXOS: desde 09/09 os quatro
  // aparecem em toda aba, ativos ou esmaecidos, para a barra não trocar de
  // composição a cada troca de aba. Os outros vêm do motivo da sub-aba.
  assert.deepEqual(inc.map((i) => i.key).sort(),
    ['departamento', 'jobFamily', 'marcaProduto', 'modeloTrabalho', 'tempoCasa', 'tipoContrato']);
  for (const i of inc) assert.ok(i.reason.length > 20, `${i.key} sem motivo`);
});

test('em Onboarding, área NÃO entra na lista de indisponíveis', () => {
  const chaves = unavailableFilters('engagement', 'onboarding').map((i) => i.key);
  assert.ok(!chaves.includes('departamento'), 'área funciona em Onboarding');
  assert.ok(chaves.includes('tempoCasa'));
  assert.ok(chaves.includes('modeloTrabalho'));
  assert.ok(chaves.includes('marcaProduto'), 'marca não recorta o onboarding');
});

test('sem sub-aba, a aba manda -- e os fixos que ela não recorta ficam esmaecidos', () => {
  // A ordem é a da barra (fixos primeiro), e não a ordem em que a lista da aba
  // foi digitada: `tempoCasa` é fixo e vem antes dos extras.
  assert.deepEqual(filtersForTab('engagement', null),
    ['departamento', 'tempoCasa', 'modeloTrabalho', 'marcaProduto']);
  assert.deepEqual(unavailableFilters('engagement', null).map((i) => i.key),
    ['jobFamily', 'tipoContrato']);
});

test('os quatro fixos aparecem em TODA aba, ativos ou esmaecidos', () => {
  // A promessa da barra desde 09/09. Se uma aba nova esquecer de declarar um
  // deles, ele continua aparecendo esmaecido com motivo -- nunca some.
  const FIXOS = ['departamento', 'jobFamily', 'tipoContrato', 'tempoCasa'];
  const abas = ['overview', 'dei', 'demographics', 'span', 'recruitment',
    'engagement', 'attrition', 'comp', 'team', 'data'] as const;
  for (const aba of abas) {
    const vistos = new Set([
      ...filtersForTab(aba, null),
      ...unavailableFilters(aba, null).map((i) => i.key),
    ]);
    for (const f of FIXOS) assert.ok(vistos.has(f as never), `${aba} perdeu ${f}`);
  }
});

test('os fixos vêm primeiro, na ordem acordada, antes dos extras', () => {
  // Departamento, Job family, Contrato, Tempo de casa -- e só então level,
  // faixa salarial, tipo de desligamento, modelo, marca.
  // `modeloTrabalho` saiu de Atrição em 09/09: aparecia ativo e não filtrava
  // nada -- a base de desligados por pessoa não guarda modelo de trabalho.
  assert.deepEqual(filtersForTab('attrition', null), [
    'departamento', 'jobFamily', 'tipoContrato', 'tempoCasa',
    'level', 'faixaSalarial', 'tipoDesligamento',
  ]);
  assert.deepEqual(filtersForTab('comp', 'compratio'), [
    'departamento', 'jobFamily', 'tipoContrato', 'tempoCasa', 'level', 'faixaSalarial',
  ]);
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
