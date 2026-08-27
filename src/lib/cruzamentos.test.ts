import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCuts, computeDriverScores, computeDriverImportance,
  CRUZAMENTOS, CUTS_PADRAO, SEPARADOR_CRUZAMENTO,
  ehCruzamento, partesDoCruzamento, comporCruzamento, type PollyResponse,
} from "./aggregator/polly-survey";
import { areaDoRecorte, recorteVisivel } from "./recorte-visivel";
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

test("os seis cruzamentos entram no padrão, junto dos simples", () => {
  assert.deepEqual(CRUZAMENTOS, [
    "area+tempo", "area+marca", "area+funcao", "area+modelo",
    "tempo+modelo", "area+tempo+modelo",
  ]);
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

// ===========================================================================
// O QUE O AGREGADOR PRODUZ CABE NO QUE O VALIDADOR ACEITA
// ===========================================================================
// Quinta vez no mesmo dia. O teto de `importance` era 200, dimensionado quando
// a associação com o eNPS era uma linha por pergunta (34). Ela passou a ser
// calculada por área, viraram 204, e a carga inteira foi recusada por 4 linhas.
//
// Este teste roda o agregador de verdade sobre uma onda do tamanho da real e
// confere que o resultado cabe. Não alcança o schema Zod -- ele vive num
// arquivo de servidor --, mas trava o número que importa: quanto o agregador
// produz.

test("uma onda do tamanho da real cabe nos tetos do import", () => {
  // 9 áreas, 7 faixas, 3 marcas, 34 perguntas, 485 respostas: ago/26.
  const AREAS = ['Technology', 'Customer Service', 'Marketing', 'Commercial',
    'Product', 'Finance', 'Human Resources', 'Legal', 'Outros'];
  const FAIXAS = ['0-3 meses', '3-6 meses', '6-9 meses', '9-12 meses',
    '12-18 meses', '18-24 meses', '24+ meses'];
  const MARCAS = ['Betnacional', 'Betfair', 'Ambas'];
  const MODELOS = ['Remoto', 'Híbrido', 'Presencial'];

  const rs: PollyResponse[] = [];
  for (let i = 0; i < 485; i++) {
    // A nota varia COM a pessoa, senão a variância é zero e a correlação não
    // existe -- e o teste mediria o vazio em vez do tamanho.
    const drivers: Record<string, number> = {};
    for (let q = 0; q < 34; q++) drivers[`D${q % 11}||pergunta ${q}`] = ((i + q) % 5) + 1;
    rs.push({
      area: AREAS[i % AREAS.length],
      tempoCasa: FAIXAS[i % FAIXAS.length],
      marca: MARCAS[i % MARCAS.length],
      modelo: MODELOS[i % MODELOS.length],
      gestor: i % 4 === 0,
      nps: ((i % 5) * 2) + 1,
      retencao: 8, satisfacao: 8,
      drivers,
    } as unknown as PollyResponse);
  }

  const cuts = computeCuts(rs);
  const imp = computeDriverImportance(rs);
  const drv = computeDriverScores(rs);

  // Os tetos escritos em `survey-import.functions.ts`, com a conta por trás.
  assert.ok(cuts.length <= 440, `cuts: ${cuts.length}`);
  assert.ok(drv.length <= 3600, `driverScores: ${drv.length}`);
  assert.ok(imp.length <= 1260, `importance: ${imp.length}`);

  // E o que o teto antigo teria feito: 34 × 10 recortes passa de 200.
  assert.ok(imp.length > 200, `com importância por área, ${imp.length} > 200 -- o teto antigo`);
});


// ===========================================================================
// OS DOIS CRUZAMENTOS QUE NÃO SÃO 'area+algo'
// ===========================================================================

test("tempo+modelo cruza sem área, e a permissão sabe disso", () => {
  const rows = computeCuts(BASE);
  const tm = rows.filter((r) => r.cutType === "tempo+modelo");
  assert.ok(tm.length > 0, "nenhuma linha de tempo+modelo");
  for (const r of tm) assert.ok(r.cutValue.includes(SEPARADOR_CRUZAMENTO), r.cutValue);

  // `areaDoRecorte` precisa devolver null: o primeiro campo é "24+ meses", e
  // lê-lo como área compararia uma faixa de tempo com a lista de áreas.
  assert.equal(areaDoRecorte("tempo+modelo", "24+ meses || Remoto"), null);
  // E por não ser de área nenhuma, é transversal: passa até para um escopo
  // que nega tudo. Sem isto, a tela diria "não existe" para um dado que está
  // gravado e que todo perfil pode ver.
  assert.equal(recorteVisivel("tempo+modelo", "24+ meses || Remoto", () => false), true);
});

test("no triplo, a permissão lê a ÁREA do primeiro campo", () => {
  const chave = "Technology || 24+ meses || Remoto";
  assert.equal(areaDoRecorte("area+tempo+modelo", chave), "Technology");
  assert.equal(recorteVisivel("area+tempo+modelo", chave, (a) => a === "Technology"), true);
  assert.equal(recorteVisivel("area+tempo+modelo", chave, (a) => a === "Marketing"), false);
});

test("o triplo só nasce quando os TRÊS campos existem", () => {
  // Meia chave viraria um grupo falso: "Technology || 24+ meses" gravado como
  // 'area+tempo+modelo' seria lido como um grupo que não é nenhum dos dois.
  const rows = computeCuts(BASE.map((r) => ({ ...r, modelo: null })));
  assert.equal(rows.filter((r) => r.cutType === "area+tempo+modelo").length, 0);
  assert.equal(rows.filter((r) => r.cutType === "tempo+modelo").length, 0);
  // E os cruzamentos que não dependem de modelo seguem inteiros.
  assert.ok(rows.some((r) => r.cutType === "area+tempo"));
});

test("comporCruzamento é o único que escreve o separador", () => {
  assert.equal(comporCruzamento("Marketing", "24+ meses"), "Marketing || 24+ meses");
  assert.equal(
    comporCruzamento("Technology", "24+ meses", "Remoto"),
    "Technology || 24+ meses || Remoto",
  );
  // Sem área, não sobra separador solto na frente -- uma chave que não casa
  // com nada, e "não casa com nada" chega à tela como "não existe".
  assert.equal(comporCruzamento("", "24+ meses"), "24+ meses");
});
