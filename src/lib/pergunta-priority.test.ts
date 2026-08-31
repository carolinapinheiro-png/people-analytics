import test from "node:test";
import assert from "node:assert/strict";
import {
  forcaDaAssociacao,
  classifyPerguntas,
  favoravelDe,
  temaDominante,
  type PerguntaEntrada,
} from "./pergunta-priority";

/**
 * Os quatro quadrantes eram calculados em três cartões diferentes, com dois
 * cortes diferentes para o eixo da nota. Estes testes fixam a régua única.
 */

/** r: 0,3 0,4 0,5 0,6 -> mediana 0,45 · fav: 60 70 80 90 -> mediana 75 */
const BASE: PerguntaEntrada[] = [
  { driver: "Comunicação", question: "puxa e nota baixa", r: 0.6, score: 3.0, favoravel: 60 },
  { driver: "Comunicação", question: "puxa e nota alta", r: 0.5, score: 4.5, favoravel: 90 },
  { driver: "Gestão", question: "nao puxa e nota baixa", r: 0.4, score: 3.5, favoravel: 70 },
  { driver: "Gestão", question: "nao puxa e nota alta", r: 0.3, score: 4.2, favoravel: 80 },
];

const por = (c: ReturnType<typeof classifyPerguntas>, q: string) =>
  c.itens.find((i) => i.question === q);

test("os quatro quadrantes saem do cruzamento de duas medianas", () => {
  const c = classifyPerguntas(BASE);
  assert.equal(c.corteR, 0.45);
  assert.equal(c.corteFavoravel, 75);
  assert.equal(por(c, "puxa e nota baixa")?.quadrante, "prioridade");
  assert.equal(por(c, "puxa e nota alta")?.quadrante, "sustentar");
  assert.equal(por(c, "nao puxa e nota baixa")?.quadrante, "observar");
  assert.equal(por(c, "nao puxa e nota alta")?.quadrante, "base");
});

test("o corte é em % favorável, não na média", () => {
  // As duas estatísticas discordam de propósito nesta fixture: pela média a
  // pergunta ficaria de um lado, pelo % favorável fica do outro. É o caso que
  // fazia três cartões classificarem a mesma pergunta em quadrantes distintos.
  const discordantes: PerguntaEntrada[] = [
    { driver: "A", question: "media alta, poucos concordam", r: 0.6, score: 4.4, favoravel: 55 },
    { driver: "A", question: "media baixa, muitos concordam", r: 0.6, score: 3.6, favoravel: 95 },
    { driver: "B", question: "c", r: 0.2, score: 4.0, favoravel: 70 },
    { driver: "B", question: "d", r: 0.2, score: 4.0, favoravel: 80 },
  ];
  const c = classifyPerguntas(discordantes);
  assert.equal(c.corteFavoravel, 75);
  // Pela média (4,4 contra mediana 4,0) esta seria "nota alta". Pelo %, não é.
  assert.equal(por(c, "media alta, poucos concordam")?.quadrante, "prioridade");
  assert.equal(por(c, "media baixa, muitos concordam")?.quadrante, "sustentar");
});

test("sem % favorável, a média entra convertida", () => {
  const semFav: PerguntaEntrada[] = [
    { driver: "A", question: "a", r: 0.6, score: 3.0, favoravel: null },
    { driver: "A", question: "b", r: 0.6, score: 4.5 },
    { driver: "B", question: "c", r: 0.2, score: 3.5, favoravel: null },
    { driver: "B", question: "d", r: 0.2, score: 4.0 },
  ];
  assert.equal(favoravelDe(semFav[0]), 60);
  assert.equal(favoravelDe(semFav[1]), 90);
  const c = classifyPerguntas(semFav);
  assert.equal(c.corteFavoravel, 75);
  assert.equal(por(c, "a")?.quadrante, "prioridade");
});

test("o corte convertido para 1 a 5 acompanha o de %", () => {
  // Quem plota na escala 1 a 5 precisa da MESMA linha, não de outra mediana.
  const c = classifyPerguntas(BASE);
  assert.equal(c.corteFavoravelEmNota, 3.75);
  assert.equal(c.corteFavoravelEmNota * 20, c.corteFavoravel);
});

test("tema dominante conta, e diz de quantas categorias", () => {
  const t = temaDominante(BASE);
  assert.equal(t.quantas, 2);
  assert.equal(t.categorias, 2);
  assert.ok(t.tema === "Comunicação" || t.tema === "Gestão");
});

test("lista vazia não inventa tema", () => {
  const t = temaDominante([]);
  assert.equal(t.tema, null);
  assert.equal(t.quantas, 0);
  assert.equal(t.categorias, 0);
});

// ---------------------------------------------------------------------------
// A PALAVRA QUE TRADUZ O r
// ---------------------------------------------------------------------------

test('a escala em palavra segue os cortes da lista', () => {
  const c = { alto: 0.4, medio: 0.25 };
  assert.equal(forcaDaAssociacao(0.55, c), 'puxa muito');
  assert.equal(forcaDaAssociacao(0.4, c), 'puxa muito', 'o corte é inclusivo');
  assert.equal(forcaDaAssociacao(0.3, c), 'puxa');
  assert.equal(forcaDaAssociacao(0.1, c), 'puxa pouco');
});

test('correlação NEGATIVA não é "puxa pouco"', () => {
  // Relação inversa é uma relação forte andando ao contrário, não uma relação
  // fraca. Uma pergunta com r = -0,30 separa engajado de não engajado tanto
  // quanto uma com +0,30; chamá-la de "puxa pouco" a esconderia no fim da
  // lista, que é exatamente onde ninguém olha.
  const c = { alto: 0.4, medio: 0.25 };
  assert.equal(forcaDaAssociacao(-0.3, c), 'anda ao contrário');
  assert.equal(forcaDaAssociacao(-0.01, c), 'anda ao contrário');
});

test('zero continua sendo "puxa pouco", e não inverso', () => {
  // Ausência de relação não é relação inversa.
  assert.equal(forcaDaAssociacao(0, { alto: 0.4, medio: 0.25 }), 'puxa pouco');
});

test('com todos os cortes negativos, o sinal ainda manda', () => {
  // Os cortes saem da própria lista: num recorte onde tudo é fraco, o quartil
  // superior pode ser negativo. O rótulo não pode chamar um r negativo de
  // "puxa muito" só porque ele é o melhor de um conjunto ruim.
  assert.equal(forcaDaAssociacao(-0.1, { alto: -0.2, medio: -0.3 }), 'anda ao contrário');
});
