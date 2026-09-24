import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chaveDaPergunta, montarTendencia, sinaisDaTendencia, type LinhaDriver,
} from '@/lib/tendencia-comparaveis';

const JUL_RECOMP = 'Sou recompensado de forma justa (ex: salário, promoção, treinamentos) pelas minhas contribuições para a Flutter Brazil.';
const JAN_RECOMP = 'Sinto que sou recompensado(a) de forma justa (ex.: salário, promoção, treinamento) pelas minhas contribuições em comparação com outras pessoas do meu departamento';
const GESTOR = 'Meu gestor se importa com a minha opinião.';
const CARREIRA = 'Vejo possibilidades de crescimento na minha carreira dentro da organização.';
const INFORMADO = 'Sou mantido informado sobre o andamento das transformações e mudanças organizacionais.';
const NOVA = 'Sei onde encontrar as informações de que preciso.';

const l = (question: string, cutType: string, cutValue: string, favoravel: number | null): LinhaDriver =>
  ({ question, cutType, cutValue, n: 30, favoravel });

// Números reais de Product (jul/25 e jan/26), conferidos contra o banco.
const jul: LinhaDriver[] = [
  l(GESTOR, 'company', 'company', 90.5), l(GESTOR, 'area', 'Product', 90.3),
  l(JUL_RECOMP, 'company', 'company', 73.6), l(JUL_RECOMP, 'area', 'Product', 67.7),
  l(CARREIRA, 'company', 'company', 79.0), l(CARREIRA, 'area', 'Product', 83.9),
  l(INFORMADO, 'company', 'company', 60), l(INFORMADO, 'area', 'Product', 58),
];
const jan: LinhaDriver[] = [
  l(GESTOR, 'company', 'company', 89.3), l(GESTOR, 'area', 'Product', 100),
  l(JAN_RECOMP, 'company', 'company', 72.9), l(JAN_RECOMP, 'area', 'Product', 78.9),
  l(CARREIRA, 'company', 'company', 78.0), l(CARREIRA, 'area', 'Product', 78.4),
  l(NOVA, 'company', 'company', 80), l(NOVA, 'area', 'Product', 82),
];

test('recompensa justa casa entre as duas redações', () => {
  assert.equal(chaveDaPergunta(JUL_RECOMP), chaveDaPergunta(JAN_RECOMP));
  assert.equal(chaveDaPergunta(JUL_RECOMP), 'recompensa-justa');
});

test('pergunta fora da lista casa pelo texto normalizado', () => {
  assert.equal(chaveDaPergunta('Uma pergunta  nova.'), chaveDaPergunta('uma pergunta nova'));
});

test('só entram as comparáveis: sem par nas duas ondas, fica fora', () => {
  const t = montarTendencia(jan, jul, 'Product');
  assert.deepEqual(t.map((x) => x.chave).sort(),
    ['crescimento-carreira', 'gestor-se-importa', 'recompensa-justa']);
});

test('deltas e gap da área contra a empresa', () => {
  const t = montarTendencia(jan, jul, 'Product');
  const rec = t.find((x) => x.chave === 'recompensa-justa')!;
  assert.equal(rec.areaAntes, 67.7);
  assert.equal(rec.areaDepois, 78.9);
  assert.equal(rec.deltaArea, 11.2);
  assert.equal(rec.deltaEmpresa, -0.7);
  assert.equal(rec.gap, 6);
  // Ordenado pela posição contra a empresa, como o deck.
  assert.equal(t[0].chave, 'gestor-se-importa');
});

test('sem área: colunas da área vazias, empresa preenchida', () => {
  const t = montarTendencia(jan, jul, null);
  assert.equal(t.length, 3);
  assert.ok(t.every((x) => x.areaDepois == null && x.gap == null && x.empresaDepois != null));
});

test('sinais: destaque, melhora e queda, só acima do limiar', () => {
  const s = sinaisDaTendencia(montarTendencia(jan, jul, 'Product'));
  assert.deepEqual(s.map((x) => [x.tipo, x.linha.chave]), [
    ['destaque', 'gestor-se-importa'],
    ['melhora', 'recompensa-justa'],
    ['queda', 'crescimento-carreira'],
  ]);
  const calmo = sinaisDaTendencia(montarTendencia(
    [l(GESTOR, 'company', 'company', 90), l(GESTOR, 'area', 'X', 91)],
    [l(GESTOR, 'company', 'company', 90), l(GESTOR, 'area', 'X', 90)],
    'X',
  ));
  assert.deepEqual(calmo, []);
});
