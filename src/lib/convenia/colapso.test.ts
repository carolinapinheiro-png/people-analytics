import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarColapso } from './colapso';

/**
 * O caso real que motivou este arquivo, com os números da execução de 01/09.
 */

const gravadas = [
  { brand: 'NSX', month: '2026-07-01', headcount: 578 },
  { brand: 'NSX', month: '2026-08-01', headcount: 578 },
  { brand: 'Betfair BR', month: '2026-07-01', headcount: 34 },
  { brand: 'Betfair BR', month: '2026-08-01', headcount: 34 },
  { brand: 'Flutter International', month: '2026-08-01', headcount: 21 },
];

test('Betfair BR caindo de 34 para 2 é pego', () => {
  // Zero ativos, 7 desligados na listagem -- suficiente para a marca "existir"
  // e produzir 24 meses de série. A trava anterior só sabia detectar sumiço,
  // e por isso deixou este caso passar.
  const achados = detectarColapso(
    [
      { brand: 'NSX', month: '2026-08-01', headcount: 578 },
      { brand: 'Betfair BR', month: '2026-08-01', headcount: 2 },
    ],
    gravadas,
  );
  assert.deepEqual(achados, [
    { brand: 'Betfair BR', month: '2026-08-01', gravado: 34, novo: 2 },
  ]);
});

test('marca que sumiu inteira NÃO é colapso -- é o outro caso', () => {
  // Sem mês em comum não há o que comparar, e inventar um daria falso
  // positivo. Quem chama já trata sumiço por outro caminho.
  const achados = detectarColapso(
    [{ brand: 'NSX', month: '2026-08-01', headcount: 578 }],
    gravadas,
  );
  assert.equal(achados.length, 0);
});

test('compara o último mês presente NOS DOIS lados', () => {
  // Comparar o mês mais novo de cada lado poria agosto fechado contra setembro
  // pela metade, e acusaria queda todo primeiro dia do mês.
  const achados = detectarColapso(
    [
      { brand: 'NSX', month: '2026-08-01', headcount: 578 },
      { brand: 'NSX', month: '2026-09-01', headcount: 40 }, // setembro em curso
    ],
    gravadas,
  );
  assert.equal(achados.length, 0, 'setembro parcial não conta: agosto é o mês comum');
});

test('marca pequena não dispara -- alarme à toa é alarme desligado', () => {
  const achados = detectarColapso(
    [{ brand: 'Piloto', month: '2026-08-01', headcount: 1 }],
    [{ brand: 'Piloto', month: '2026-08-01', headcount: 3 }],
  );
  assert.equal(achados.length, 0);
});

test('queda normal passa; metade exata é suspeita', () => {
  const base = [{ brand: 'X', month: '2026-08-01', headcount: 100 }];
  assert.equal(detectarColapso([{ brand: 'X', month: '2026-08-01', headcount: 80 }], base).length, 0);
  assert.equal(detectarColapso([{ brand: 'X', month: '2026-08-01', headcount: 51 }], base).length, 0);
  assert.equal(detectarColapso([{ brand: 'X', month: '2026-08-01', headcount: 50 }], base).length, 1);
});

test('crescer nunca é colapso', () => {
  const achados = detectarColapso(
    [{ brand: 'NSX', month: '2026-08-01', headcount: 633 }],
    gravadas,
  );
  assert.equal(achados.length, 0, 'o inchaço do NSX é o outro lado da unificação, não uma queda');
});

test('a mesma marca vinda de duas empresas soma antes de comparar', () => {
  // NSX vem de três tokens. Comparar cada um isolado acusaria colapso em
  // qualquer marca repartida entre empresas.
  const achados = detectarColapso(
    [
      { brand: 'NSX', month: '2026-08-01', headcount: 300 },
      { brand: 'NSX', month: '2026-08-01', headcount: 278 },
    ],
    gravadas,
  );
  assert.equal(achados.length, 0);
});
