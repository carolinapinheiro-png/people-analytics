import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AJUDA, descreverFaixa, faixaDe, rotuloDe, toneDe,
  type AjudaMetrica, type ChaveMetrica,
} from './metric-help';

/**
 * `AJUDA` usa `as const` para que cada chave seja um literal -- e isso faz o
 * acesso por variavel devolver a uniao dos verbetes, em que os campos
 * opcionais nao existem em todos. Este acessor devolve o formato comum.
 */
const verbete = (c: ChaveMetrica): AjudaMetrica => AJUDA[c] as AjudaMetrica;

/**
 * O ponto destes testes não é a cor em si: é a promessa de que a COR e o
 * TEXTO saem da mesma lista. Enquanto o limiar viveu dentro do componente,
 * qualquer explicação escrita seria uma segunda cópia do número -- e cópias
 * divergem no primeiro ajuste, em silêncio, com a explicação passando a
 * mentir sobre a tela que explica.
 */

test('as faixas do eNPS continuam as mesmas de antes da mudança', () => {
  // Valores conferidos contra o `enpsTone` que existia no EngagementTab.
  assert.equal(toneDe('enps', 76), 'good');
  assert.equal(toneDe('enps', 70), 'good');
  assert.equal(toneDe('enps', 69), 'neutral');
  assert.equal(toneDe('enps', 50), 'neutral');
  assert.equal(toneDe('enps', 49), 'warn');
  assert.equal(toneDe('enps', 30), 'warn');
  assert.equal(toneDe('enps', 29), 'bad');
  assert.equal(toneDe('enps', -10), 'bad');
});

test('risco de saída é invertido: quanto maior, pior', () => {
  assert.equal(toneDe('riscoSaida', 25), 'bad');
  assert.equal(toneDe('riscoSaida', 12), 'warn');
  assert.equal(toneDe('riscoSaida', 5), 'good');
  assert.equal(AJUDA.riscoSaida.inverso, true);
});

test('satisfação e participação mantêm os limiares antigos', () => {
  assert.equal(toneDe('satisfacao', 8.9), 'good');
  assert.equal(toneDe('satisfacao', 7.5), 'neutral');
  assert.equal(toneDe('satisfacao', 6.9), 'warn');
  assert.equal(toneDe('participacao', 79), 'good');
  assert.equal(toneDe('participacao', 60), 'neutral');
  assert.equal(toneDe('participacao', 40), 'warn');
});

test('sem valor não inventa cor', () => {
  // Um cartão sem dado não pode aparecer verde. `neutral` é o certo.
  assert.equal(toneDe('enps', null), 'neutral');
  assert.equal(toneDe('enps', undefined), 'neutral');
  assert.equal(toneDe('enps', NaN), 'neutral');
  assert.equal(rotuloDe('enps', null), undefined);
  assert.equal(faixaDe('enps', null), null);
});

test('métrica sem faixas não colore nada', () => {
  // Comp-ratio não tem faixa de cor: 85% pode ser correto ou não dependendo
  // do caso. Fingir um veredito aqui seria pior que não dar nenhum.
  assert.equal(toneDe('compRatio', 85), 'neutral');
  assert.equal(faixaDe('compRatio', 85), null);
});

test('a descrição da faixa fecha sem buraco e sem sobreposição', () => {
  // "de 50 a 70" e "70 ou mais" deixariam dúvida sobre onde o 70 cai --
  // dúvida sobre a fronteira entre duas cores.
  assert.equal(descreverFaixa('enps', 0), '70 ou mais');
  assert.equal(descreverFaixa('enps', 1), 'de 50 até menos de 70');
  assert.equal(descreverFaixa('enps', 2), 'de 30 até menos de 50');
  assert.equal(descreverFaixa('enps', 3), 'abaixo de 30');
});

test('a descrição usa a unidade certa de cada métrica', () => {
  assert.equal(descreverFaixa('riscoSaida', 0), '20% ou mais');
  assert.equal(descreverFaixa('satisfacao', 0), '8/10 ou mais');
});

test('toda faixa está em ordem decrescente e termina em -Infinity', () => {
  // A busca é `find(v >= min)` e depende da ordem. Uma lista fora de ordem
  // devolveria a faixa errada sem erro nenhum.
  for (const chave of Object.keys(AJUDA) as ChaveMetrica[]) {
    const faixas = verbete(chave).faixas;
    if (!faixas) continue;
    for (let i = 1; i < faixas.length; i++) {
      assert.ok(
        faixas[i].min < faixas[i - 1].min,
        `${chave}: faixa ${i} não é menor que a anterior`,
      );
    }
    assert.equal(
      faixas[faixas.length - 1].min, -Infinity,
      `${chave}: a última faixa precisa cobrir todo o resto`,
    );
  }
});

test('todo verbete tem título e definição, e nenhum fica só na definição', () => {
  for (const chave of Object.keys(AJUDA) as ChaveMetrica[]) {
    const a = verbete(chave);
    assert.ok(a.titulo?.length > 0, `${chave} sem título`);
    assert.ok(a.oQueE?.length > 0, `${chave} sem definição`);
    // Um verbete que só define é dicionário. O que evita leitura errada é o
    // `comoLer` ou o `cuidado` -- ao menos um dos dois.
    assert.ok(
      (a.comoLer?.length ?? 0) > 0 || (a.cuidado?.length ?? 0) > 0,
      `${chave} não diz como ler nem o que evitar`,
    );
  }
});
