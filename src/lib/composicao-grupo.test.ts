import test from 'node:test';
import assert from 'node:assert/strict';
import { composicaoDoGrupo } from '@/lib/drill';

const c = (cutType: string, cutValue: string, n: number) => ({ cutType, cutValue, n });

test('composicaoDoGrupo: da maior para a menor fatia', () => {
  const r = composicaoDoGrupo([
    c('area+marca', 'Finance || Cross Brand', 18),
    c('area+marca', 'Marketing || Cross Brand', 48),
    c('area+marca', 'Legal || Cross Brand', 12),
    c('area+marca', 'Marketing || Betnacional', 30),
    c('marca', 'Cross Brand', 122),
  ], 'area+marca', 'Cross Brand');
  assert.deepEqual(r, [
    { area: 'Marketing', n: 48 },
    { area: 'Finance', n: 18 },
    { area: 'Legal', n: 12 },
  ]);
});

test('composicaoDoGrupo: nome de área com espaço não quebra a divisão', () => {
  const r = composicaoDoGrupo(
    [c('area+marca', 'Human Resources || Cross Brand', 18)], 'area+marca', 'Cross Brand',
  );
  assert.deepEqual(r, [{ area: 'Human Resources', n: 18 }]);
});

test('composicaoDoGrupo: sem cruzamento carregado, devolve vazio em vez de inventar', () => {
  assert.deepEqual(composicaoDoGrupo([c('marca', 'Cross Brand', 122)], 'area+marca', 'Cross Brand'), []);
});
