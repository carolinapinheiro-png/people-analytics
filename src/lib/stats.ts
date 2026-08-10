/**
 * Estatística mínima para os cruzamentos da aba Experiência.
 *
 * ------------------------------------------------------------------
 * POR QUE SPEARMAN E NÃO PEARSON
 * ------------------------------------------------------------------
 * Estamos correlacionando 8 ou 9 departamentos. Com n desse tamanho, uma única
 * área fora da curva (Customer Service tem 26% de risco declarado, o dobro da
 * mediana) domina o coeficiente de Pearson inteiro. Spearman usa a ORDEM, não o
 * valor, então um extremo pesa igual a qualquer outro ponto. Para "as áreas mais
 * arriscadas na pesquisa foram as que mais perderam gente?", ordem é exatamente
 * a pergunta certa.
 *
 * ------------------------------------------------------------------
 * POR QUE TODO RESULTADO VEM COM UM VEREDITO EM PORTUGUÊS
 * ------------------------------------------------------------------
 * Um rho de 0,55 numa tela sem contexto vira "existe correlação" na boca de
 * quem apresenta. Com n=8, rho=0,55 não passa nem perto de significância — é
 * ruído com aparência de achado. Como este painel vai para liderança, gestores e
 * RH ao mesmo tempo, o número não pode viajar sozinho: `verdict` acompanha o
 * coeficiente e diz, sem jargão, se aquilo sustenta uma decisão.
 *
 * A regra que este arquivo implementa: quando em dúvida, chamar de insuficiente.
 * O custo de um "não dá para afirmar" é uma conversa; o custo de um falso achado
 * é uma reorganização feita pelo motivo errado.
 */

export type Strength = 'insuficiente' | 'fraca' | 'moderada' | 'forte';

export interface CorrelationResult {
  /** Coeficiente de Spearman, -1 a 1. null quando não há pares suficientes. */
  rho: number | null;
  /** Pares efetivamente usados (descarta qualquer ponto com valor faltando). */
  n: number;
  /** Passou no teste bilateral a 5%? Com n pequeno, quase sempre false. */
  significant: boolean;
  /** Valor crítico de rho para n pares a 5%. null quando n < 5. */
  critical: number | null;
  strength: Strength;
  /** Frase pronta para a tela. Sempre presente, mesmo sem correlação. */
  verdict: string;
}

/**
 * Valores críticos de Spearman, teste bilateral, α = 0,05.
 * Tabela padrão; abaixo de n=5 nenhum resultado é testável.
 */
const CRITICAL_05: Record<number, number> = {
  5: 1.0, 6: 0.886, 7: 0.786, 8: 0.738, 9: 0.7, 10: 0.648,
  11: 0.618, 12: 0.587, 13: 0.56, 14: 0.538, 15: 0.521,
  16: 0.503, 17: 0.485, 18: 0.472, 19: 0.46, 20: 0.447,
};

function criticalFor(n: number): number | null {
  if (n < 5) return null;
  if (CRITICAL_05[n] != null) return CRITICAL_05[n];
  // Acima de 20, aproximação assintótica: rho_crit ≈ 1,96 / sqrt(n-1).
  return Math.round((1.96 / Math.sqrt(n - 1)) * 1000) / 1000;
}

/**
 * Postos com correção para empates (média dos postos empatados). Sem isso, duas
 * áreas com o mesmo eNPS receberiam postos arbitrários e o rho mudaria conforme
 * a ordem em que os dados chegaram do banco -- um número instável, que é pior
 * que um número ausente.
 */
function ranks(values: number[]): number[] {
  const idx = values.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    const media = (i + j) / 2 + 1; // postos base 1
    for (let k = i; k <= j; k++) out[idx[k].i] = media;
    i = j + 1;
  }
  return out;
}

export function spearman(
  pairs: Array<[number | null | undefined, number | null | undefined]>,
): CorrelationResult {
  const limpo = pairs.filter(
    ([a, b]) => a != null && b != null && Number.isFinite(a) && Number.isFinite(b),
  ) as Array<[number, number]>;
  const n = limpo.length;

  if (n < 4) {
    return {
      rho: null, n, significant: false, critical: null, strength: 'insuficiente',
      verdict: `Só ${n} área${n === 1 ? '' : 's'} com os dois números. Não dá para falar em correlação.`,
    };
  }

  const rx = ranks(limpo.map((p) => p[0]));
  const ry = ranks(limpo.map((p) => p[1]));
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = rx[i] - mx, b = ry[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  // Variância zero: todas as áreas com o mesmo valor em um dos eixos. Não é
  // correlação zero, é ausência de variação -- e a tela precisa dizer isso.
  if (dx === 0 || dy === 0) {
    return {
      rho: null, n, significant: false, critical: criticalFor(n), strength: 'insuficiente',
      verdict: 'Um dos indicadores é igual em todas as áreas — sem variação, não há o que correlacionar.',
    };
  }

  const rho = Math.round((num / Math.sqrt(dx * dy)) * 1000) / 1000;
  const critical = criticalFor(n);
  const significant = critical != null && Math.abs(rho) >= critical;
  const abs = Math.abs(rho);

  const strength: Strength = !significant
    ? 'insuficiente'
    : abs >= 0.7 ? 'forte' : abs >= 0.5 ? 'moderada' : 'fraca';

  const direcao = rho > 0 ? 'mesma direção' : 'direções opostas';

  // Três desfechos diferentes, e confundi-los é o erro clássico de leitura:
  //
  //   ρ ≈ 0        → não há sinal. Dizer "a tendência aparece" seria inventar
  //                  uma inclinação que o dado não tem.
  //   ρ relevante  → há inclinação, mas o n não sustenta. Hipótese, não achado.
  //   significante → dá para usar.
  //
  // E nenhum dos dois primeiros é "provamos que não existe relação": com n
  // pequeno, ausência de evidência não é evidência de ausência. A frase precisa
  // dizer isso, porque quem apresenta vai ser perguntado exatamente sobre isso.
  const semSinal = Math.abs(rho) < 0.15;
  const verdict = significant
    ? `Relação ${strength} e estatisticamente sustentável (ρ=${rho.toFixed(2)}, n=${n}): os dois indicadores andam na ${direcao}.`
    : semSinal
      ? `Não há sinal de relação (ρ=${rho.toFixed(2)}, n=${n}) — os dois indicadores parecem independentes nestes dados. Isso não prova que não exista relação: com ${n} pontos, o teste não teria força para achá-la mesmo que ela estivesse lá.`
      : `A inclinação existe (ρ=${rho.toFixed(2)}), mas com ${n} áreas não se sustenta estatisticamente — seria preciso ρ acima de ${critical?.toFixed(2) ?? '—'}. Trate como hipótese a investigar, não como conclusão.`;

  return { rho, n, significant, critical, strength, verdict };
}

/** Média simples ignorando nulos. null quando não sobrou nada. */
export function mean(values: Array<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return v.reduce((s, x) => s + x, 0) / v.length;
}

/** Mediana ignorando nulos. Usada para cortar os quadrantes da matriz. */
export function median(values: Array<number | null | undefined>): number | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
