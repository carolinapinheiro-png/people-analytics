import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCuts, CRUZAMENTOS, CUTS_PADRAO, SEPARADOR_CRUZAMENTO,
  ehCruzamento, partesDoCruzamento, type PollyResponse,
} from "./aggregator/polly-survey";
import { recorteNoEscopo } from "./dept-filter";
import { deptForScope } from "./engagement-context";

/**
 * ===========================================================================
 * O CRUZAMENTO SEMPRE FOI POSSÍVEL — SÓ NUNCA FOI CALCULADO
 * ===========================================================================
 * Cada resposta carrega área, tempo de casa, marca, função e modelo na MESMA
 * linha. O agregador percorria uma dimensão por vez, e a tela transformava essa
 * escolha de agregação em "não existe a quebra por área nesta série" -- uma
 * lacuna anunciada como impossibilidade.
 *
 * O bloco mais importante aqui é o de PERMISSÃO, no fim: um recorte cruzado
 * carrega uma área dentro do nome, e é por essa porta que ele vazaria.
 */

const r = (
  area: string | null,
  tempoCasa: string | null,
  marca: string | null,
  gestor: boolean | null,
  modelo: string | null,
  nps: number,
): PollyResponse => ({
  area, tempoCasa, marca, gestor, modelo,
  nps, retencao: 8, satisfacao: 8, respostas: {},
} as unknown as PollyResponse);

const BASE: PollyResponse[] = [
  r("Commercial", "12-18 meses", "Betnacional", false, "Remoto", 10),
  r("Commercial", "12-18 meses", "Betnacional", true, "Remoto", 9),
  r("Commercial", "24+ meses", "Ambas", false, "Híbrido", 0),
  r("Technology", "12-18 meses", "Betnacional", false, "Remoto", 10),
];

const acha = (rows: ReturnType<typeof computeCuts>, tipo: string, valor: string) =>
  rows.find((x) => x.cutType === tipo && x.cutValue === valor);

test("os quatro cruzamentos entram no padrão, junto dos simples", () => {
  assert.deepEqual(CRUZAMENTOS, ["area+tempo", "area+marca", "area+funcao", "area+modelo"]);
  for (const c of CRUZAMENTOS) assert.ok(CUTS_PADRAO.includes(c), `${c} fora do padrão`);
  // Os simples continuam: o cruzamento SOMA, não substitui.
  for (const s of ["company", "area", "funcao", "marca", "tempo", "modelo"]) {
    assert.ok(CUTS_PADRAO.includes(s as never), `${s} sumiu do padrão`);
  }
});

test("cruza área com o outro recorte, e as contas são as de sempre", () => {
  const rows = computeCuts(BASE);
  const c = acha(rows, "area+tempo", `Commercial${SEPARADOR_CRUZAMENTO}12-18 meses`)!;
  assert.equal(c.n, 2);
  // Dois promotores (10 e 9) em duas respostas -> eNPS 100. Mesma fórmula do
  // recorte simples, sobre um grupo menor. Nenhuma estatística nova.
  assert.equal(c.enps, 100);
});

test("meia chave não vira grupo: sem área ou sem o outro lado, a resposta sai", () => {
  // Uma resposta sem área entraria num balde "|| 12-18 meses", que não é nem
  // área nem faixa -- um grupo que não descreve ninguém.
  const comBuraco = [...BASE, r(null, "12-18 meses", "Ambas", false, "Remoto", 10), r("Legal", null, "Ambas", false, "Remoto", 10)];
  const rows = computeCuts(comBuraco, ["area+tempo"]);
  assert.ok(rows.every((x) => partesDoCruzamento(x.cutValue) != null));
  assert.ok(!rows.some((x) => x.cutValue.startsWith(SEPARADOR_CRUZAMENTO.trim())));
  // Mas ela continua contando nos recortes simples que consegue responder.
  const soArea = computeCuts(comBuraco, ["area"]);
  assert.equal(acha(soArea, "area", "Legal")?.n, 1);
});

test("o nome composto se desmonta de volta nas duas partes", () => {
  const p = partesDoCruzamento(`Customer Service${SEPARADOR_CRUZAMENTO}0-3 meses`);
  assert.deepEqual(p, { area: "Customer Service", valor: "0-3 meses" });
  // Nome simples não é cruzamento -- e confundi-los é o que abriria a porta.
  assert.equal(partesDoCruzamento("Commercial"), null);
  assert.equal(ehCruzamento("area"), false);
  assert.equal(ehCruzamento("area+tempo"), true);
});

// ===========================================================================
// PERMISSÃO — A PARTE QUE PODE VAZAR
// ===========================================================================
// "Commercial || 12-18 meses" é um recorte DE ÁREA para efeito de permissão.
// Se alguém o tratar como nome comum, `deptForScope` não o reconhece e ele cai
// no mesmo ramo de marca e tempo -- que perfil global recebe inteiro. Um
// cruzamento por área vazaria pela porta que o recorte por departamento existe
// para fechar.

const SO_TECH = { departments: ["TECHNOLOGY"], jobFamilies: [] } as never;

/** A regra como o servidor a aplica, incluindo a extração da área. */
const visivel = (cutType: string, cutValue: string, sel: string | null, global: boolean) => {
  const area = ehCruzamento(cutType)
    ? (partesDoCruzamento(cutValue)?.area ?? null)
    : cutType === "area" ? cutValue
    : null;
  if (area == null) return cutType !== "area";
  return recorteNoEscopo(SO_TECH, deptForScope(area), sel, global);
};

test("perfil de uma área não recebe o cruzamento de outra", () => {
  assert.equal(
    visivel("area+tempo", `Commercial${SEPARADOR_CRUZAMENTO}12-18 meses`, null, false),
    false,
  );
  assert.equal(
    visivel("area+tempo", `Technology${SEPARADOR_CRUZAMENTO}12-18 meses`, null, false),
    true,
  );
});

test("a seleção também estreita o cruzamento, e nunca amplia", () => {
  // Perfil global filtrando Technology não vê o cruzamento de Commercial...
  assert.equal(
    visivel("area+tempo", `Commercial${SEPARADOR_CRUZAMENTO}12-18 meses`, "TECHNOLOGY", true),
    false,
  );
  // ...e perfil restrito a Technology pedindo Commercial continua sem ver.
  assert.equal(
    visivel("area+tempo", `Commercial${SEPARADOR_CRUZAMENTO}12-18 meses`, "COMMERCIAL", false),
    false,
  );
});

test("nome composto não reconhecido falha FECHADO", () => {
  // Se um dia o separador mudar e a extração parar de funcionar, o nome inteiro
  // vai para `deptForScope`, que devolve null -- e a linha some em vez de
  // aparecer. É a direção segura de falhar, e este teste fixa isso.
  assert.equal(deptForScope(`Commercial${SEPARADOR_CRUZAMENTO}12-18 meses`), null);
  assert.equal(
    recorteNoEscopo(SO_TECH, null, null, false),
    false,
  );
  assert.equal(
    recorteNoEscopo(SO_TECH, null, "COMMERCIAL", true),
    false,
  );
});

test("recorte que não é de área nenhuma segue a regra antiga", () => {
  // Marca e tempo cortam a empresa por outro eixo: perfil global vê, e a
  // seleção de área não se aplica a eles.
  assert.equal(visivel("tempo", "12-18 meses", "COMMERCIAL", true), true);
  assert.equal(visivel("marca", "Ambas", null, true), true);
});

// ===========================================================================
// OS PORTÕES QUE PRECISAM CONHECER OS TIPOS NOVOS
// ===========================================================================
// Três vezes no mesmo dia um recorte novo foi declarado no agregador e barrado
// em outro lugar: a consulta do servidor filtrando `cut_type`, a tabela
// `engagement_scores` não atualizada junto, e o enum do validador de import --
// que fez a carga inteira falhar com 124 erros.
//
// Estes testes não conseguem alcançar o servidor nem o banco. O que eles fazem
// é fixar a única defesa que existe em código: as listas derivam de CUTS_PADRAO
// em vez de repetirem os nomes.

test("CUTS_PADRAO é a lista completa, e os cruzamentos estão nela", () => {
  // Quem valida entrada usa esta constante. Se alguém adicionar um tipo ao
  // CUT_KEY e esquecer daqui, a carga passa a produzir um recorte que o
  // validador recusa -- e a importação inteira falha, não só aquele recorte.
  for (const c of CRUZAMENTOS) {
    assert.ok(CUTS_PADRAO.includes(c), `${c} fora de CUTS_PADRAO`);
  }
});

test("todo tipo que computeCuts produz está em CUTS_PADRAO", () => {
  // O teste que descreve o erro de verdade: o agregador nunca pode devolver um
  // recorte que a lista de aceitos não conhece.
  const tipos = new Set(computeCuts(BASE).map((c) => c.cutType));
  for (const t of tipos) {
    assert.ok((CUTS_PADRAO as string[]).includes(t), `computeCuts produziu ${t}, fora da lista`);
  }
});

test("o nome composto cabe no limite de 120 caracteres do validador", () => {
  // `cutValue` é limitado a 120 no schema. O cruzamento soma dois nomes mais o
  // separador, e estourar isso faria a carga falhar só nas áreas de nome longo
  // -- um erro que só aparece em produção, e em algumas áreas.
  const maiores = computeCuts(BASE)
    .map((c) => c.cutValue.length)
    .sort((a, b) => b - a);
  assert.ok(maiores[0] <= 120, `maior cutValue tem ${maiores[0]} caracteres`);
});
