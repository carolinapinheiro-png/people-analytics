import test from 'node:test';
import assert from 'node:assert/strict';
import { detectarColapso, detectarSaltoDeHistoria, type PontoDeSerie } from './colapso';

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

// A execucao de 04/09, com Empresa a 96%: uma pessoa admitida em 2013 e
// marcada como Flutter International levou 151 meses de historia para uma
// marca que nasceu em 2025, e tirou 77 da NSX. Nenhum headcount despencou no
// mes comparado, entao detectarColapso ficou calado.
const GRAVADO_HIST: PontoDeSerie[] = [
  { brand: 'NSX', month: '2013-03-01', headcount: 40 },
  { brand: 'NSX', month: '2026-08-01', headcount: 600 },
  { brand: 'Flutter International', month: '2025-10-01', headcount: 18 },
  { brand: 'Flutter International', month: '2026-08-01', headcount: 21 },
];

test('marca que ganha historia que nao tinha e pega', () => {
  const achados = detectarSaltoDeHistoria([
    { brand: 'Flutter International', month: '2013-03-01', headcount: 1 },
    { brand: 'Flutter International', month: '2026-08-01', headcount: 21 },
  ], GRAVADO_HIST);
  const f = achados.find((a) => a.brand === 'Flutter International');
  assert.equal(f?.gravadoDe, '2025-10');
  assert.equal(f?.novoDe, '2013-03');
  assert.ok(f!.mesesDeDiferenca > 0, 'ganhar historia para tras e diferenca positiva');
  assert.equal(f?.mesesDeDiferenca, 151);
});

test('marca que perde a historia que tinha tambem e pega', () => {
  const achados = detectarSaltoDeHistoria([
    { brand: 'NSX', month: '2019-08-01', headcount: 300 },
    { brand: 'NSX', month: '2026-08-01', headcount: 600 },
  ], GRAVADO_HIST);
  assert.equal(achados.find((a) => a.brand === 'NSX')?.novoDe, '2019-08');
});

test('um desligado antigo entrando nao dispara o alarme', () => {
  // Tres meses a mais para tras: e o caso normal de um desligado com admissao
  // anterior entrar na conta. Alarme que toca a toa e alarme desligado.
  const achados = detectarSaltoDeHistoria([
    { brand: 'NSX', month: '2012-12-01', headcount: 38 },
    { brand: 'NSX', month: '2026-08-01', headcount: 600 },
  ], GRAVADO_HIST);
  assert.equal(achados.find((a) => a.brand === 'NSX'), undefined);
});

test('serie identica nao acusa nada', () => {
  assert.deepEqual(detectarSaltoDeHistoria(GRAVADO_HIST, GRAVADO_HIST), []);
});

test('marca nova, sem historico gravado, nao acusa', () => {
  const achados = detectarSaltoDeHistoria(
    [{ brand: 'Marca Nova', month: '2013-01-01', headcount: 10 }], GRAVADO_HIST,
  );
  assert.equal(achados.length, 0);
});
