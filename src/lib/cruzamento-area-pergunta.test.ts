import test from "node:test";
import assert from "node:assert/strict";
import { cruzarAreasComPerguntas } from "./cruzamento-area-pergunta";

const PRIO = [
  { question: "comunicado em tempo hábil", driver: "Comunicação" },
  { question: "remuneração justa", driver: "Remuneração" },
  { question: "vejo crescimento", driver: "Carreira" },
];
const EMPRESA = new Map<string, number | null>([
  ["comunicado em tempo hábil", 68],
  ["remuneração justa", 70],
  ["vejo crescimento", 71],
]);
const NOTAS = [
  { question: "comunicado em tempo hábil", area: "Marketing", favoravel: 44, n: 81 },
  { question: "remuneração justa", area: "Marketing", favoravel: 52, n: 81 },
  { question: "vejo crescimento", area: "Marketing", favoravel: 53, n: 81 },
  // Product: colada na empresa em tudo
  { question: "comunicado em tempo hábil", area: "Product", favoravel: 66, n: 41 },
  { question: "remuneração justa", area: "Product", favoravel: 69, n: 41 },
  // recorte minúsculo, não pode virar achado
  { question: "remuneração justa", area: "Legal", favoravel: 10, n: 3 },
];

test("ordena pela maior distância e traz o driver junto", () => {
  const r = cruzarAreasComPerguntas(["Marketing"], PRIO, NOTAS, EMPRESA);
  assert.equal(r.length, 1);
  assert.equal(r[0].perguntas[0].question, "comunicado em tempo hábil");
  assert.equal(r[0].perguntas[0].gap, -24);
  assert.equal(r[0].perguntas[0].driver, "Comunicação");
  assert.equal(r[0].perguntas.length, 3);
});

test("área colada na empresa não gera achado", () => {
  const r = cruzarAreasComPerguntas(["Product"], PRIO, NOTAS, EMPRESA);
  assert.deepEqual(r, [], "diferença de 1-2 p.p. não é achado");
});

test("recorte abaixo do mínimo fica de fora", () => {
  const r = cruzarAreasComPerguntas(["Legal"], PRIO, NOTAS, EMPRESA);
  assert.deepEqual(r, [], "n=3 identifica quem respondeu e não descreve a área");
});

test("o balde residual não entra: não há a quem levar a conversa", () => {
  const comOutros = [
    ...NOTAS,
    { question: "remuneração justa", area: "Outros", favoravel: 20, n: 20 },
  ];
  const r = cruzarAreasComPerguntas(["Outros"], PRIO, comOutros, EMPRESA);
  assert.deepEqual(r, []);
});

test("só olha as perguntas prioritárias, não as 34", () => {
  const extra = [
    ...NOTAS,
    { question: "pergunta qualquer", area: "Marketing", favoravel: 1, n: 81 },
  ];
  const emp = new Map(EMPRESA);
  emp.set("pergunta qualquer", 90);
  const r = cruzarAreasComPerguntas(["Marketing"], PRIO, extra, emp);
  assert.equal(
    r[0].perguntas.some((p) => p.question === "pergunta qualquer"),
    false,
  );
});
