import test from "node:test";
import assert from "node:assert/strict";
import {
  deslocarMes, mesesDoAnoAte, ultimos12, taxaDoPeriodo, deltaPP,
  mediana, mesesDeCasaValidos, turnoverPrecoce,
} from "./desligamentos-kpis";

test("deslocar mês atravessa a virada de ano nos dois sentidos", () => {
  assert.equal(deslocarMes("2026-01", -1), "2025-12");
  assert.equal(deslocarMes("2026-09", -12), "2025-09");
  assert.equal(deslocarMes("2025-12", 1), "2026-01");
  assert.equal(deslocarMes("2026-03", -15), "2024-12");
});

test("acumulado do ano começa em janeiro e LTM tem doze meses", () => {
  assert.deepEqual(mesesDoAnoAte("2026-03"), ["2026-01", "2026-02", "2026-03"]);
  const l = ultimos12("2026-09");
  assert.equal(l.length, 12);
  assert.equal(l[0], "2025-10");
  assert.equal(l[11], "2026-09");
});

test("taxa do mês é saídas ÷ HC médio; anualizada multiplica por 12", () => {
  const serie = [{ month: "2026-09", headcount: 627, leavers: 12 }];
  const t = taxaDoPeriodo(serie, ["2026-09"])!;
  assert.equal(t.saidas, 12);
  assert.equal(t.taxa.toFixed(2), "1.91");
  assert.equal(t.anualizada.toFixed(1), "23.0");
});

test("trimestre usa o HC médio dos três meses e anualiza por 4", () => {
  const serie = [
    { month: "2026-07", headcount: 600, leavers: 6 },
    { month: "2026-08", headcount: 620, leavers: 9 },
    { month: "2026-09", headcount: 640, leavers: 12 },
  ];
  const t = taxaDoPeriodo(serie, ["2026-07", "2026-08", "2026-09"])!;
  assert.equal(t.hcMedio, 620);
  assert.equal(t.taxa.toFixed(2), (27 / 620 * 100).toFixed(2));
  assert.equal(t.anualizada.toFixed(2), (t.taxa * 4).toFixed(2));
});

test("mês faltando na série não vira comparação inventada", () => {
  const serie = [{ month: "2026-09", headcount: 627, leavers: 12 }];
  assert.equal(taxaDoPeriodo(serie, ["2025-09"]), null);
  assert.equal(taxaDoPeriodo([{ month: "2026-09", headcount: 0, leavers: 1 }], ["2026-09"]), null);
  assert.equal(deltaPP(taxaDoPeriodo(serie, ["2026-09"]), null), null);
});

test("delta em pontos percentuais, arredondado a uma casa", () => {
  const a = taxaDoPeriodo([{ month: "m", headcount: 100, leavers: 3 }], ["m"]);
  const b = taxaDoPeriodo([{ month: "m", headcount: 100, leavers: 2 }], ["m"]);
  assert.equal(deltaPP(a, b), 1);
});

test("mediana par, ímpar e vazia", () => {
  assert.equal(mediana([5, 1, 3]), 3);
  assert.equal(mediana([4, 1, 3, 2]), 2.5);
  assert.equal(mediana([]), null);
});

test("tempo de casa desconhecido não entra como zero", () => {
  const m = mesesDeCasaValidos([null, undefined, 304.4, 60.88]);
  assert.equal(m.length, 2);
  assert.equal(Math.round(m[0]), 10);
});

test("turnover precoce conta só quem tem tempo de casa", () => {
  const t = turnoverPrecoce([30, 90, 200, 400, null]);
  assert.equal(t.n, 4);
  assert.equal(t.ate3m, 2);
  assert.equal(t.ate12m, 3);
  assert.equal(t.pct3m, 50);
  assert.equal(turnoverPrecoce([null]).pct12m, null);
});
