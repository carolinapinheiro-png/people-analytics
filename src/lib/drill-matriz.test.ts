import test from "node:test";
import assert from "node:assert/strict";
import { matrizAreaDriver, perfilUniforme } from "./drill";
import type { DriverPorRecorte } from "./survey.functions";

const l = (
  cutType: string,
  cutValue: string,
  driver: string,
  question: string,
  favoravel: number | null,
  n = 40,
): DriverPorRecorte => ({ cutType, cutValue, driver, question, favoravel, n, score: null });

/**
 * Empresa: Gestão 80 (média de 90 e 70), Remuneração 60.
 * MARKETING abaixo nos dois. TECHNOLOGY acima nos dois.
 */
const BASE: DriverPorRecorte[] = [
  l("company", "Flutter Brazil", "Gestão", "g1", 90),
  l("company", "Flutter Brazil", "Gestão", "g2", 70),
  l("company", "Flutter Brazil", "Remuneração", "r1", 60),

  l("area", "MARKETING", "Gestão", "g1", 80),
  l("area", "MARKETING", "Gestão", "g2", 50),
  l("area", "MARKETING", "Remuneração", "r1", 50),

  l("area", "TECHNOLOGY", "Gestão", "g1", 95),
  l("area", "TECHNOLOGY", "Gestão", "g2", 85),
  l("area", "TECHNOLOGY", "Remuneração", "r1", 70),
];

test("a célula é a média das perguntas do driver, contra a empresa", () => {
  const m = matrizAreaDriver(BASE);
  const c = m.mapa.get("MARKETING||Gestão")!;
  assert.equal(c.favoravel, 65); // (80 + 50) / 2
  assert.equal(c.favoravelEmpresa, 80); // (90 + 70) / 2
  assert.equal(c.gap, -15);
  assert.equal(c.perguntas, 2);
});

test("a célula aponta a pior pergunta dentro dela", () => {
  // A média de Gestão em MARKETING é -15, mas g2 sozinha está -20. Sem isto, a
  // grade diria "Gestão está mal aqui" e a conversa começaria do zero.
  const c = matrizAreaDriver(BASE).mapa.get("MARKETING||Gestão")!;
  assert.equal(c.pior?.question, "g2");
  assert.equal(c.pior?.gap, -20);
});

test("grupo pequeno demais suprime a célula inteira, não só a pergunta", () => {
  const comPoucos = [
    ...BASE,
    l("area", "LEGAL", "Gestão", "g1", 95, 30),
    l("area", "LEGAL", "Gestão", "g2", 40, 3), // n = 3
  ];
  const c = matrizAreaDriver(comPoucos, 5).mapa.get("LEGAL||Gestão")!;
  assert.equal(c.favoravel, null);
  assert.equal(c.gap, null);
  assert.equal(c.nMinimo, 3);
  // Nem a pior pergunta escapa: mostrá-la daria o número que a supressão negou.
  assert.equal(c.pior, null);
});

test('"Outros" não entra na grade', () => {
  // Mesma regra de `areasNaPergunta`: é o balde de quem não é de área nenhuma.
  const m = matrizAreaDriver([...BASE, l("area", "Outros", "Gestão", "g1", 20)]);
  assert.ok(!m.areas.includes("Outros"));
  assert.equal(m.mapa.get("Outros||Gestão"), undefined);
});

test("as linhas vêm ordenadas por amplitude entre áreas, não por nota", () => {
  // Gestão: 65 a 90 -> amplitude 25. Remuneração: 50 a 70 -> 20.
  // Por NOTA, Remuneração (a pior) viria primeiro; por amplitude, Gestão.
  const m = matrizAreaDriver(BASE);
  assert.deepEqual(m.drivers, ["Gestão", "Remuneração"]);
});

test("perfil uniforme separa quem está abaixo em tudo de quem está misto", () => {
  const m = matrizAreaDriver(BASE);
  // Só 2 drivers: o corte de 5 células mínimas protege contra concluir
  // "abaixo em tudo" a partir de duas comparações.
  assert.deepEqual(perfilUniforme(m), []);

  const largo: DriverPorRecorte[] = [];
  for (let i = 1; i <= 6; i++) {
    largo.push(l("company", "Flutter Brazil", `D${i}`, `q${i}`, 80));
    largo.push(l("area", "MARKETING", `D${i}`, `q${i}`, 70)); // abaixo em 6/6
    largo.push(l("area", "TECHNOLOGY", `D${i}`, `q${i}`, i <= 3 ? 90 : 70)); // 3 e 3
  }
  const p = perfilUniforme(matrizAreaDriver(largo));
  assert.equal(p.length, 1);
  assert.equal(p[0].area, "MARKETING");
  assert.equal(p[0].direcao, "abaixo");
  assert.equal(p[0].drivers, 6);
});
