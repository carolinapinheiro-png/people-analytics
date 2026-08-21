import test from "node:test";
import assert from "node:assert/strict";
import { SEM_FILTRO, semFiltro, valorFiltro, passaFiltro } from "./filtro-sentinela";

test("o sentinela, o vazio e o nulo significam a mesma coisa", () => {
  for (const v of [SEM_FILTRO, "", "   ", null, undefined, " Todos "]) {
    assert.equal(semFiltro(v), true, `${JSON.stringify(v)} deveria ser sem filtro`);
    assert.equal(valorFiltro(v), null);
  }
});

test("um valor de verdade não é confundido com o sentinela", () => {
  assert.equal(semFiltro("MARKETING"), false);
  assert.equal(valorFiltro("  MARKETING  "), "MARKETING");
  // O sentinela é palavra exata: um departamento chamado "Todos Serviços" filtra.
  assert.equal(semFiltro("Todos Serviços"), false);
});

test("sem seleção, toda linha passa", () => {
  assert.equal(passaFiltro(SEM_FILTRO, "MARKETING"), true);
  assert.equal(passaFiltro(null, null), true);
  // Inclusive a linha sem valor -- "sem filtro" não pode esconder ninguém.
  assert.equal(passaFiltro("", null), true);
});

test("com seleção, só passa quem bate", () => {
  assert.equal(passaFiltro("MARKETING", "MARKETING"), true);
  assert.equal(passaFiltro("MARKETING", "TECHNOLOGY"), false);
  assert.equal(passaFiltro("MARKETING", null), false);
});

test("espaço nas pontas não some com a linha", () => {
  // O dado vem de planilha. Antes, a comparação era literal nas abas de
  // desligamento, e " Marketing" não batia com "Marketing".
  assert.equal(passaFiltro("Marketing", " Marketing "), true);
  assert.equal(passaFiltro(" Marketing ", "Marketing"), true);
});

test("o sentinela é constante, não literal repetido", () => {
  // Se alguém renomear o rótulo, este teste continua passando -- é o ponto.
  assert.equal(semFiltro(SEM_FILTRO), true);
});
