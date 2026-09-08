import test from 'node:test';
import assert from 'node:assert/strict';
import { ehPromocao, promovidosNoMes, type RegistroHistorico } from './wil-promocoes';

const r = (o: Partial<RegistroHistorico>): RegistroHistorico => ({
  pessoaId: 'p1', motivo: 'Promoção', vigenciaDe: '17/03/2026', ...o,
});

test('so Promocao conta, e os outros onze motivos nao', () => {
  // Medido nos 2.457 registros: Dissidio 492 e Merito/Reajuste 463 sao
  // aumento, nao progressao de carreira. Contar toda alteracao daria 1.168.
  assert.equal(ehPromocao('Promoção'), true);
  assert.equal(ehPromocao('Dissídio'), false);
  assert.equal(ehPromocao('Mérito/Reajuste'), false);
  assert.equal(ehPromocao('Admissão'), false);
  assert.equal(ehPromocao('Acordo coletivo'), false);
});

test('Alteracao de funcao NAO e promocao', () => {
  // Mudanca lateral. A Convenia ja separa as duas coisas: quem preencheu
  // escolheu dizer que nao foi promocao, e respeitar isso e mais confiavel
  // do que inferir a partir da troca de cargo.
  assert.equal(ehPromocao('Alteração de função'), false);
});

test('acento e caixa nao separam o mesmo motivo', () => {
  assert.equal(ehPromocao('promocao'), true);
  assert.equal(ehPromocao('PROMOÇÃO'), true);
  assert.equal(ehPromocao(null), false);
});

test('le as duas formas de data: export em dd/mm e API em ISO', () => {
  assert.deepEqual([...promovidosNoMes([r({ vigenciaDe: '17/03/2026' })], '2026-03')], ['p1']);
  assert.deepEqual([...promovidosNoMes([r({ vigenciaDe: '2026-03-17' })], '2026-03')], ['p1']);
});

test('promocao de outro mes nao conta', () => {
  assert.equal(promovidosNoMes([r({ vigenciaDe: '17/02/2026' })], '2026-03').size, 0);
});

test('duas promocoes no mesmo mes contam uma pessoa', () => {
  const ids = promovidosNoMes([
    r({ pessoaId: 'p1', vigenciaDe: '02/03/2026' }),
    r({ pessoaId: 'p1', vigenciaDe: '20/03/2026' }),
  ], '2026-03');
  assert.equal(ids.size, 1);
});

test('registro sem pessoa ou sem data e ignorado', () => {
  assert.equal(promovidosNoMes([r({ pessoaId: '' }), r({ vigenciaDe: 'Não informado' })], '2026-03').size, 0);
});
