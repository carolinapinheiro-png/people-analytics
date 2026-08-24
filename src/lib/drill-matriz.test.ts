import test from "node:test";
import assert from "node:assert/strict";
import {
  matrizAreaDriver, perfilUniforme, linhasDaArea, perguntasNoRecorte,
} from "./drill";
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

// ===========================================================================
// O EIXO Y DO GRÁFICO DE QUADRANTES
// ===========================================================================
// A associação com o eNPS só existe na empresa; o % que concorda existe por
// área. O cartão avisava que "os números abaixo são da empresa inteira" --
// metade verdade, e a metade falsa escondia dado que estava no banco.

const COM_AREA: DriverPorRecorte[] = [
  l("company", "Flutter Brazil", "Comunicação", "c1", 80),
  l("company", "Flutter Brazil", "Comunicação", "c2", 70),
  l("area", "MARKETING", "Comunicação", "c1", 55),
  l("area", "MARKETING", "Comunicação", "c2", 60),
  l("area", "TECHNOLOGY", "Comunicação", "c1", 92),
];

test("a nota da área substitui a da empresa, pergunta a pergunta", () => {
  const m = linhasDaArea(COM_AREA, "MARKETING");
  assert.equal(m.get("Comunicação||c1")?.favoravel, 55);
  assert.equal(m.get("Comunicação||c2")?.favoravel, 60);
  assert.equal(m.size, 2);
});

test("não vaza a nota de outra área nem a da empresa", () => {
  const favs = [...linhasDaArea(COM_AREA, "MARKETING").values()].map((l) => l.favoravel);
  // 92 é de Technology e 80 é da empresa. Nenhum dos dois pode aparecer aqui.
  assert.ok(!favs.includes(92));
  assert.ok(!favs.includes(80));
});

test("o nome da área compara sem diferenciar caixa nem espaço", () => {
  // O filtro manda "MARKETING"; a carga guarda "Marketing".
  assert.equal(linhasDaArea(COM_AREA, "  marketing ").get("Comunicação||c1")?.favoravel, 55);
});

test("pergunta suprimida por n baixo fica FORA, não cai na da empresa", () => {
  // Devolver o número da empresa no lugar seria publicar, com o rótulo da
  // área, exatamente o valor que a supressão negou.
  const comNull = [...COM_AREA, l("area", "MARKETING", "Gestão", "g1", null)];
  const m = linhasDaArea(comNull, "MARKETING");
  assert.equal(m.has("Gestão||g1"), false);
  assert.equal(m.size, 2);
});

test("área sem quebra na onda devolve mapa vazio, não silêncio confuso", () => {
  // Quem chama precisa distinguir "a área respondeu igual à empresa" de "esta
  // onda não foi quebrada por área" -- o vazio é o sinal.
  assert.equal(linhasDaArea(COM_AREA, "LEGAL").size, 0);
});

// ===========================================================================
// A TROCA QUE OS DOIS CARTÕES COMPARTILHAM
// ===========================================================================
// Aplicada num cartão só, ela recriou a divergência que `pergunta-priority.ts`
// tinha acabado de eliminar: a mesma pergunta caindo em quadrantes diferentes
// no gráfico e na lista. Por isso a regra vive aqui, e os dois a chamam.

const PERGUNTAS = [
  { driver: "Comunicação", question: "c1", r: 0.6, score: 4.0, favoravel: 80, n: 485 },
  { driver: "Comunicação", question: "c2", r: 0.5, score: 3.5, favoravel: 70, n: 485 },
  { driver: "Gestão", question: "g1", r: 0.4, score: 4.2, favoravel: 85, n: 485 },
];

const RECORTES: DriverPorRecorte[] = [
  { ...l("area", "MARKETING", "Comunicação", "c1", 55), n: 81, score: 3.1 },
  { ...l("area", "MARKETING", "Comunicação", "c2", 60), n: 81, score: 3.3 },
  { ...l("area", "MARKETING", "Gestão", "g1", null), n: 81, score: 3.9 },
  { ...l("area", "TECHNOLOGY", "Comunicação", "c1", 92), n: 149, score: 4.6 },
];

test("sem área escolhida, devolve as perguntas intactas", () => {
  const r = perguntasNoRecorte(PERGUNTAS, RECORTES, null);
  assert.deepEqual(r.linhas, PERGUNTAS);
  assert.equal(r.suprimidas, 0);
});

test("com área, TUDO que descreve a resposta passa a ser dela", () => {
  // Trocar uns e não outros é pior que não trocar nenhum: a linha mistura
  // populações sem avisar. Foi o que aconteceu duas vezes -- primeiro o `n`
  // ficou em 485 ao lado da nota de 81 pessoas, depois o `score` da empresa
  // (4,06) ficou encostado no % de Marketing (53%) na mesma linha da tela.
  const { linhas } = perguntasNoRecorte(PERGUNTAS, RECORTES, "MARKETING");
  const c1 = linhas.find((p) => p.question === "c1")!;
  assert.equal(c1.favoravel, 55);
  assert.equal(c1.n, 81);
  assert.equal(c1.score, 3.1);
  // A associação NÃO muda: ela só existe medida na empresa.
  assert.equal(c1.r, 0.6);
});

test("sem score da área, o da empresa fica -- é detalhe, não a leitura", () => {
  const semScore: DriverPorRecorte[] = [
    { ...l("area", "MARKETING", "Comunicação", "c1", 55), n: 81, score: null },
  ];
  const { linhas } = perguntasNoRecorte(PERGUNTAS, semScore, "MARKETING");
  assert.equal(linhas[0].favoravel, 55);
  assert.equal(linhas[0].score, 4.0);
});

test("pergunta sem nota da área sai da lista e é contada", () => {
  const r = perguntasNoRecorte(PERGUNTAS, RECORTES, "MARKETING");
  assert.equal(r.linhas.length, 2);
  assert.equal(r.suprimidas, 1);
  assert.ok(!r.linhas.some((p) => p.question === "g1"));
});

test("os dois cartões recebem exatamente a mesma lista", () => {
  // O teste que descreve o motivo da função existir: chamada duas vezes com a
  // mesma entrada, ela não pode devolver coisas diferentes -- e enquanto a
  // lógica estava copiada em um cartão só, devolvia.
  const a = perguntasNoRecorte(PERGUNTAS, RECORTES, "MARKETING");
  const b = perguntasNoRecorte(PERGUNTAS, RECORTES, "MARKETING");
  assert.deepEqual(a.linhas, b.linhas);
  assert.equal(a.suprimidas, b.suprimidas);
});

test("área sem quebra nenhuma esvazia a lista, em vez de cair na empresa", () => {
  // Silêncio aqui viraria "esta área responde igual à empresa", que é
  // afirmação -- e ninguém mediu isso.
  const r = perguntasNoRecorte(PERGUNTAS, RECORTES, "LEGAL");
  assert.equal(r.linhas.length, 0);
  assert.equal(r.suprimidas, 3);
});
