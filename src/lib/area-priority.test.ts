/**
 * Testes da fila de prioridade por área.
 *
 *   npx tsc src/lib/area-priority.ts src/lib/stats.ts src/lib/area-priority.test.ts \
 *     --outDir /tmp/aptest --module commonjs --target es2020 --strict \
 *     --esModuleInterop --skipLibCheck --moduleResolution node
 *   node --test /tmp/aptest/area-priority.test.js
 *
 * O caso que motivou este arquivo está no primeiro teste: com corte na mediana
 * pura, Technology (2,5 pontos abaixo, 0,55 acima) recebia o mesmo rótulo de
 * "agir primeiro" que Marketing (19,5 abaixo, 10,85 acima). Rótulo forte em
 * cima de diferença de ruído manda gestor procurar problema que não existe.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyAreas, type AreaEntrada } from "./area-priority";

/** Números reais de jan/2026, depois da correção contra o arquivo original. */
const JAN26: AreaEntrada[] = [
  {
    scope: "Customer Service",
    dept: "OPERATION",
    enps: 85,
    retentionRisk: 26.2,
    headcountMedio: 138,
  },
  { scope: "Marketing", dept: "MARKETING", enps: 62, retentionRisk: 23.4, headcountMedio: 84 },
  { scope: "Technology", dept: "TECHNOLOGY", enps: 79, retentionRisk: 13.1, headcountMedio: 161 },
  { scope: "Commercial", dept: "COMMERCIAL", enps: 76, retentionRisk: 12.0, headcountMedio: 44 },
  { scope: "Human Resources", dept: "HR", enps: 88, retentionRisk: 17.6, headcountMedio: 22 },
  { scope: "Finance", dept: "FINANCE", enps: 84, retentionRisk: 10.5, headcountMedio: 42 },
  { scope: "Product", dept: "PRODUCT", enps: 84, retentionRisk: 7.9, headcountMedio: 35 },
  { scope: "Legal", dept: "LEGAL & COMPLIANCE", enps: 47, retentionRisk: 6.7, headcountMedio: 17 },
  // Marca, não departamento -- não pode entrar na fila.
  { scope: "Betfair", dept: null, enps: 75, retentionRisk: 15, headcountMedio: null },
];

const por = (c: ReturnType<typeof classifyAreas>, scope: string) =>
  c.itens.find((i) => i.scope === scope);

test("Betfair é marca e fica fora da fila por área", () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, "Betfair"), undefined);
  assert.equal(c.itens.length, 8);
});

test("área na fronteira RECEBE o rótulo -- e é marcada como frágil", () => {
  // Technology em jan/26: 2,5 abaixo da mediana de eNPS e 0,55 acima na de
  // risco. A régua anterior a poupava do rótulo; a mediana não poupa.
  //
  // A decisão de 21/08 foi trocar o silêncio pelo aviso: uma régua só, igual à
  // da matriz de ação, e o veredito frágil sinalizado em vez de suprimido.
  // Com n informado, `noLimite` é quem conta essa parte.
  const c = classifyAreas(JAN26);
  assert.equal(por(c, "Technology")?.veredito, "agir");
  const comN = classifyAreas(
    JAN26.map((a) => (a.scope === "Technology" ? { ...a, respostas: 161 } : a)),
  );
  // E aqui o marcador prova o próprio ponto. Technology está 2,5 pontos abaixo
  // na mediana de eNPS -- folgado para 161 respostas, onde uma pessoa vale 0,6.
  // Mas no RISCO ela está a 0,55 p.p. da linha: menos que uma pessoa.
  //
  // É literalmente o caso que a régua antiga citava como motivo para existir.
  // A mediana volta a rotular Technology, e o aviso captura a fragilidade sem
  // precisar de uma segunda régua que discorde da matriz.
  const tech = por(comN, "Technology")!;
  assert.equal(tech.pesoDeUmaResposta, 0.6);
  assert.equal(tech.distanciaEnps, 2.5);
  // 13,1 - 12,55 dá 0,5499999... em ponto flutuante, e arredonda para 0,5.
  // O `noLimite` compara o valor cheio, não o exibido, então não muda nada.
  assert.equal(tech.distanciaRisco, 0.5);
  assert.equal(tech.noLimite, true, "decidido pelo eixo do risco, por menos de uma pessoa");
});

test('área claramente pior nos dois eixos vira "agir primeiro"', () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, "Marketing")?.veredito, "agir");
  // Com a mediana, "agir" deixa de ser exclusivo: metade das áreas cai abaixo
  // de cada linha por construção. Marketing continua sendo a PIOR -- é isso
  // que a ordem precisa garantir, não a exclusividade do rótulo.
  const agir = c.itens.filter((i) => i.veredito === "agir").map((i) => i.scope);
  assert.ok(agir.includes("Marketing"));
  assert.equal(agir[0], "Marketing", "Marketing precisa liderar o grupo");
});

test('risco alto sem engajamento baixo vira "vigiar"', () => {
  const c = classifyAreas(JAN26);
  assert.equal(por(c, "Customer Service")?.veredito, "vigiar");
});

test('engajamento baixo sem risco alto vira "ouvir", não "agir"', () => {
  // Legal tem o pior eNPS da empresa (47) e o MENOR risco (6,7%). Colocá-la em
  // "agir" mandaria a área correr atrás de gente que não está saindo.
  const c = classifyAreas(JAN26);
  assert.equal(por(c, "Legal")?.veredito, "ouvir");
});

test("o corte é a mediana pura, sem margem", () => {
  const c = classifyAreas(JAN26);
  for (const i of c.itens) {
    const abaixo = i.enps < c.medianaEnps;
    const riscoAlto = (i.risco ?? 0) > c.medianaRisco;
    const esperado =
      abaixo && riscoAlto ? "agir" : riscoAlto ? "vigiar" : abaixo ? "ouvir" : "manter";
    assert.equal(i.veredito, esperado, `${i.scope} não segue a mediana`);
  }
});

// ---------------------------------------------------------------------------
// O VEREDITO FRÁGIL É MARCADO, NÃO ESCONDIDO
// ---------------------------------------------------------------------------
// A régua antiga exigia distância maior que o afastamento típico do grupo para
// rotular. Isso protegia contra ruído, mas discordava da matriz de ação, que
// cortava pela mediana -- a mesma área saía classificada de dois jeitos na
// mesma tela. Unificou-se na mediana e a proteção virou aviso.

test("veredito decidido por menos que uma resposta vem marcado", () => {
  // Área de 40 respostas: uma pessoa vale 2,5 pontos de eNPS. Colocada 1 ponto
  // abaixo da mediana, o rótulo existe mas não é estável.
  // eNPS 40,70,76,80,85,90 -> mediana 78 · risco 5,8,10,30,32,35 -> mediana 20
  const base: AreaEntrada[] = [
    { scope: "A", dept: "A", enps: 90, retentionRisk: 5, headcountMedio: 50, respostas: 40 },
    { scope: "B", dept: "B", enps: 85, retentionRisk: 8, headcountMedio: 50, respostas: 40 },
    { scope: "C", dept: "C", enps: 80, retentionRisk: 10, headcountMedio: 50, respostas: 40 },
    // 2 pontos abaixo da mediana; uma resposta vale 2,5.
    { scope: "Limite", dept: "D", enps: 76, retentionRisk: 30, headcountMedio: 50, respostas: 40 },
    { scope: "Outra", dept: "E", enps: 70, retentionRisk: 32, headcountMedio: 50, respostas: 40 },
    // 38 pontos abaixo: nenhuma pessoa sozinha vira isso.
    { scope: "Folgada", dept: "F", enps: 40, retentionRisk: 35, headcountMedio: 50, respostas: 40 },
  ];
  const c = classifyAreas(base);
  const limite = por(c, "Limite")!;
  const folgada = por(c, "Folgada")!;
  assert.equal(limite.veredito, folgada.veredito, "as duas caem no mesmo veredito");
  assert.equal(limite.noLimite, true, "a que está a 1 ponto da linha é frágil");
  assert.equal(folgada.noLimite, false, "a que está a 30 pontos não é");
  assert.equal(limite.pesoDeUmaResposta, 2.5);
});

test("sem n de respostas, não afirma fragilidade", () => {
  // Não saber quanto uma pessoa move não é o mesmo que saber que é estável.
  const c = classifyAreas(JAN26);
  assert.equal(
    c.itens.every((i) => i.noLimite === false),
    true,
  );
  assert.equal(
    c.itens.every((i) => i.pesoDeUmaResposta === null),
    true,
  );
});

test("grupo homogêneo não gera alarme nenhum", () => {
  // Todas iguais: MAD zero, mas ninguém está fora do grupo.
  const iguais: AreaEntrada[] = ["A", "B", "C", "D"].map((s) => ({
    scope: s,
    dept: s,
    enps: 80,
    retentionRisk: 12,
    headcountMedio: 50,
  }));
  const c = classifyAreas(iguais);
  assert.equal(
    c.itens.every((i) => i.veredito === "manter"),
    true,
  );
});

test("a fila é ordenada por gravidade, não por eNPS", () => {
  const c = classifyAreas(JAN26);
  const ordem = c.itens.map((i) => i.scope);
  // Marketing (agir) precede Customer Service (vigiar), que precede Legal (ouvir),
  // mesmo Legal tendo o pior eNPS de todas.
  assert.ok(ordem.indexOf("Marketing") < ordem.indexOf("Customer Service"));
  assert.ok(ordem.indexOf("Customer Service") < ordem.indexOf("Legal"));
});

test("entre duas áreas igualmente ruins, a maior vem primeiro", () => {
  const base: AreaEntrada[] = [
    { scope: "Grande", dept: "G", enps: 40, retentionRisk: 40, headcountMedio: 200 },
    { scope: "Pequena", dept: "P", enps: 40, retentionRisk: 40, headcountMedio: 10 },
    { scope: "Boa1", dept: "B1", enps: 90, retentionRisk: 5, headcountMedio: 50 },
    { scope: "Boa2", dept: "B2", enps: 88, retentionRisk: 6, headcountMedio: 50 },
    { scope: "Boa3", dept: "B3", enps: 92, retentionRisk: 4, headcountMedio: 50 },
  ];
  const c = classifyAreas(base);
  const agir = c.itens.filter((i) => i.veredito === "agir").map((i) => i.scope);
  assert.deepEqual(agir, ["Grande", "Pequena"]);
});

test("área sem risco informado não é tratada como risco zero", () => {
  const comNull: AreaEntrada[] = [
    { scope: "SemRisco", dept: "S", enps: 40, retentionRisk: null, headcountMedio: 50 },
    { scope: "A", dept: "A", enps: 80, retentionRisk: 10, headcountMedio: 50 },
    { scope: "B", dept: "B", enps: 82, retentionRisk: 12, headcountMedio: 50 },
    { scope: "C", dept: "C", enps: 84, retentionRisk: 30, headcountMedio: 50 },
  ];
  const c = classifyAreas(comNull);
  // eNPS baixo entra em "ouvir"; sem risco conhecido não pode virar "agir".
  assert.equal(por(c, "SemRisco")?.veredito, "ouvir");
});
